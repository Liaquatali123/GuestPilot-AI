import { NextRequest, NextResponse } from 'next/server';
import dns from 'node:dns/promises';
import net from 'node:net';

export const runtime = 'nodejs';

/**
 * Checks whether an IPv4 or IPv6 address belongs to any private, loopback,
 * link-local, carrier-grade NAT, multicast, or cloud metadata range.
 */
function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0 && parts[2] === 0) return true;
    if (a === 192 && b === 0 && parts[2] === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }

  if (net.isIPv6(cleanIp)) {
    const normalized = cleanIp.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // Unique local fc00::/7
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    if (normalized.startsWith('ff')) return true; // Multicast
    return false;
  }

  return true;
}

async function validatePublicUrlAndResolveDns(rawUrl: string): Promise<{
  ok: boolean;
  parsedUrl?: URL;
  reason?: string;
}> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL syntax.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URLs containing embedded credentials are not allowed.' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal'
  ) {
    return { ok: false, reason: 'Internal or localhost hostnames are blocked (SSRF protection).' };
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, reason: 'Private or reserved IP addresses are blocked (SSRF protection).' };
    }
    return { ok: true, parsedUrl: parsed };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { ok: false, reason: 'Could not resolve domain DNS.' };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return {
          ok: false,
          reason: 'Domain resolves to a private or reserved IP address (SSRF protection).',
        };
      }
    }
  } catch {
    return { ok: false, reason: 'DNS resolution failed for the provided domain.' };
  }

  return { ok: true, parsedUrl: parsed };
}

function normalizeUrlForComparison(input: string, baseUrl?: string): {
  full: string;
  hostAndPath: string;
  hostname: string;
} {
  try {
    const u = baseUrl ? new URL(input, baseUrl) : new URL(input);
    const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = u.pathname.replace(/\/+$/, '') || '';
    const search = u.search || '';
    return {
      full: `${hostname}${pathname}${search}`.toLowerCase(),
      hostAndPath: `${hostname}${pathname}`.toLowerCase(),
      hostname,
    };
  } catch {
    const cleaned = input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
    return {
      full: cleaned,
      hostAndPath: cleaned.split('?')[0],
      hostname: cleaned.split('/')[0],
    };
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const publishedUrl = typeof body.publishedUrl === 'string' ? body.publishedUrl.trim() : '';
    const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
    const expectedAnchorText =
      typeof body.expectedAnchorText === 'string' ? body.expectedAnchorText.trim() : '';

    if (!publishedUrl || !targetUrl) {
      return NextResponse.json(
        { error: 'Both Published Article URL and Target URL are required.' },
        { status: 400 }
      );
    }

    const initialTargetCheck = await validatePublicUrlAndResolveDns(
      /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`
    );
    if (!initialTargetCheck.ok) {
      return NextResponse.json(
        { error: `Invalid Target URL: ${initialTargetCheck.reason}` },
        { status: 400 }
      );
    }

    // Follow redirects manually (max 4 hops), validating SSRF safety on each hop
    let currentUrl = publishedUrl;
    let response: Response | null = null;
    const maxRedirects = 4;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const check = await validatePublicUrlAndResolveDns(currentUrl);
      if (!check.ok || !check.parsedUrl) {
        return NextResponse.json({
          pageAccessible: false,
          httpStatus: 0,
          targetLinkFound: false,
          anchorMatched: false,
          relAttribute: 'Unknown',
          backlinkType: 'Unknown',
          verificationStatus: 'Verification Inconclusive',
          verifiedAt: new Date().toISOString(),
          message: check.reason || 'URL blocked by security policy.',
        });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        response = await fetch(check.parsedUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (compatible; GuestPilotBacklinkVerifier/1.0; +https://guestpilot.app)',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        return NextResponse.json({
          pageAccessible: false,
          httpStatus: 0,
          targetLinkFound: false,
          anchorMatched: false,
          relAttribute: 'Unknown',
          backlinkType: 'Unknown',
          verificationStatus: 'Verification Inconclusive',
          verifiedAt: new Date().toISOString(),
          message:
            fetchErr instanceof Error
              ? `Network or timeout error while fetching page: ${fetchErr.message}`
              : 'Network request failed.',
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status >= 300 && response.status < 400) {
        const locationHeader = response.headers.get('location');
        if (!locationHeader) {
          return NextResponse.json({
            pageAccessible: false,
            httpStatus: response.status,
            targetLinkFound: false,
            anchorMatched: false,
            relAttribute: 'Unknown',
            backlinkType: 'Unknown',
            verificationStatus: 'Verification Inconclusive',
            verifiedAt: new Date().toISOString(),
            message: `Redirect response (${response.status}) missing Location header.`,
          });
        }
        try {
          currentUrl = new URL(locationHeader, currentUrl).toString();
        } catch {
          return NextResponse.json({
            pageAccessible: false,
            httpStatus: response.status,
            targetLinkFound: false,
            anchorMatched: false,
            relAttribute: 'Unknown',
            backlinkType: 'Unknown',
            verificationStatus: 'Verification Inconclusive',
            verifiedAt: new Date().toISOString(),
            message: 'Unsafe or malformed redirect URL.',
          });
        }
        if (hop === maxRedirects) {
          return NextResponse.json({
            pageAccessible: false,
            httpStatus: response.status,
            targetLinkFound: false,
            anchorMatched: false,
            relAttribute: 'Unknown',
            backlinkType: 'Unknown',
            verificationStatus: 'Verification Inconclusive',
            verifiedAt: new Date().toISOString(),
            message: 'Too many redirects (exceeded 4 hops).',
          });
        }
        continue;
      }

      break;
    }

    if (!response) {
      return NextResponse.json({
        pageAccessible: false,
        httpStatus: 0,
        targetLinkFound: false,
        anchorMatched: false,
        relAttribute: 'Unknown',
        backlinkType: 'Unknown',
        verificationStatus: 'Verification Inconclusive',
        verifiedAt: new Date().toISOString(),
        message: 'No response received from server.',
      });
    }

    const httpStatus = response.status;
    if (httpStatus < 200 || httpStatus >= 300) {
      return NextResponse.json({
        pageAccessible: false,
        httpStatus,
        targetLinkFound: false,
        anchorMatched: false,
        relAttribute: 'Unknown',
        backlinkType: 'Unknown',
        verificationStatus: 'Verification Inconclusive',
        verifiedAt: new Date().toISOString(),
        message: `Publisher server returned HTTP ${httpStatus}. Verification inconclusive.`,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('html')) {
      return NextResponse.json({
        pageAccessible: true,
        httpStatus,
        targetLinkFound: false,
        anchorMatched: false,
        relAttribute: 'Unknown',
        backlinkType: 'Unknown',
        verificationStatus: 'Verification Inconclusive',
        verifiedAt: new Date().toISOString(),
        message: `Published URL returned non-HTML content (${contentType || 'unknown'}).`,
      });
    }

    // Read up to 1.5MB of HTML safely
    const rawHtml = (await response.text()).slice(0, 1_500_000);
    const normalizedTarget = normalizeUrlForComparison(
      /^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`
    );

    const anchorTagRegex = /<a\s+([^>]*?)>([\s\S]*?)<\/a>/gi;
    const matchedLinks: {
      href: string;
      anchorText: string;
      relTokens: string[];
      backlinkType: string;
    }[] = [];

    let match: RegExpExecArray | null;
    while ((match = anchorTagRegex.exec(rawHtml)) !== null) {
      const attrs = match[1] || '';
      const innerHtml = match[2] || '';

      const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(attrs);
      if (!hrefMatch) continue;
      const hrefVal = (hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || '').trim();
      if (!hrefVal || hrefVal.startsWith('#') || hrefVal.startsWith('javascript:')) continue;

      const normalizedHref = normalizeUrlForComparison(hrefVal, currentUrl);
      const isExactOrPathMatch =
        normalizedHref.full === normalizedTarget.full ||
        normalizedHref.hostAndPath === normalizedTarget.hostAndPath ||
        (normalizedTarget.hostAndPath === normalizedTarget.hostname &&
          normalizedHref.hostname === normalizedTarget.hostname);

      if (isExactOrPathMatch) {
        const relMatch = /rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(attrs);
        const relRaw = (relMatch ? relMatch[1] || relMatch[2] || relMatch[3] || '' : '')
          .toLowerCase()
          .trim();
        const relTokens = relRaw ? relRaw.split(/\s+/).filter(Boolean) : [];

        let backlinkType = 'Dofollow';
        if (relTokens.includes('sponsored')) {
          backlinkType = 'Sponsored';
        } else if (relTokens.includes('nofollow') || relTokens.includes('ugc')) {
          backlinkType = 'Nofollow';
        }

        matchedLinks.push({
          href: hrefVal,
          anchorText: stripHtmlTags(innerHtml),
          relTokens,
          backlinkType,
        });
      }
    }

    if (matchedLinks.length === 0) {
      return NextResponse.json({
        pageAccessible: true,
        httpStatus,
        targetLinkFound: false,
        anchorMatched: false,
        relAttribute: 'none',
        backlinkType: 'Unknown',
        verificationStatus: 'Link Missing',
        verifiedAt: new Date().toISOString(),
        message: 'Page is accessible (HTTP 200), but no link pointing to the target URL was found.',
      });
    }

    const expectedLower = expectedAnchorText.toLowerCase();
    const bestMatch =
      matchedLinks.find((item) =>
        expectedLower ? item.anchorText.toLowerCase().includes(expectedLower) : true
      ) || matchedLinks[0];

    const anchorMatched = expectedLower
      ? bestMatch.anchorText.toLowerCase().includes(expectedLower)
      : true;

    const relString =
      bestMatch.relTokens.length > 0 ? bestMatch.relTokens.join(' ') : 'none (dofollow)';

    const verificationStatus = anchorMatched ? 'Verified' : 'Anchor Mismatch';

    return NextResponse.json({
      pageAccessible: true,
      httpStatus,
      targetLinkFound: true,
      anchorMatched,
      detectedAnchorText: bestMatch.anchorText,
      detectedHref: bestMatch.href,
      relAttribute: relString,
      backlinkType: bestMatch.backlinkType,
      verificationStatus,
      verifiedAt: new Date().toISOString(),
      message: anchorMatched
        ? `Backlink verified (${bestMatch.backlinkType}) with anchor "${bestMatch.anchorText}".`
        : `Target link found, but detected anchor "${bestMatch.anchorText}" did not match expected "${expectedAnchorText}".`,
    });
  } catch (error) {
    return NextResponse.json({
      pageAccessible: false,
      httpStatus: 0,
      targetLinkFound: false,
      anchorMatched: false,
      relAttribute: 'Unknown',
      backlinkType: 'Unknown',
      verificationStatus: 'Verification Inconclusive',
      verifiedAt: new Date().toISOString(),
      message:
        error instanceof Error
          ? `Verification inconclusive: ${error.message}`
          : 'Unexpected verification error.',
    });
  }
}
