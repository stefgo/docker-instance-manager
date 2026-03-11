/**
 * Converts an IPv4 string to a 32-bit integer.
 */
function ipToLong(ip: string): number {
    const parts = ip.split(".");
    if (parts.length !== 4) return 0;
    return (
        ((parseInt(parts[0]) << 24) >>> 0) +
        ((parseInt(parts[1]) << 16) >>> 0) +
        ((parseInt(parts[2]) << 8) >>> 0) +
        (parseInt(parts[3]) >>> 0)
    );
}

/**
 * Checks if an IP address is within a CIDR range.
 * Supports IPv4.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
    const [range, bitsStr] = cidr.split("/");
    const bits = bitsStr ? parseInt(bitsStr) : 32;

    if (bits === 0) return true; // 0.0.0.0/0

    const ipLong = ipToLong(ip);
    const rangeLong = ipToLong(range);

    const mask = (0xffffffff << (32 - bits)) >>> 0;

    return (ipLong & mask) === (rangeLong & mask);
}

/**
 * Checks if an IP address is in any of the provided networks (CIDR strings).
 * If networks list is empty, it defaults to allowing everything (0.0.0.0/0).
 */
export function isIpInNetworks(
    ip: string,
    networks: string[],
    defaultAllow = false,
): boolean {
    if (!networks || networks.length === 0) {
        return defaultAllow;
    }

    return networks.some((cidr) => isIpInCidr(ip, cidr));
}
