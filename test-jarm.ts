import tls from "node:tls";
import crypto from "node:crypto";
import net from "node:net";

// JARM is complex to implement fully from scratch in Node as it requires sending raw custom ClientHellos
// with specific extensions, versions, and ciphers. The node:tls module does not expose enough low-level
// control to perfectly spoof the 10 specific ClientHellos required for a true JARM hash.
// However, we can send a custom buffer over a raw net.Socket to simulate one TLS ClientHello probe
// to verify the logic.

const generateClientHello = () => {
    // A minimal TLS 1.2 ClientHello byte array
    const hello = Buffer.from([
        0x16, // Handshake
        0x03, 0x01, // TLS 1.0 (Record Layer)
        0x00, 0x2f, // Length: 47
        0x01, // Client Hello
        0x00, 0x00, 0x2b, // Length: 43
        0x03, 0x03, // TLS 1.2 (Handshake)
        // 32 bytes random
        ...crypto.randomBytes(32),
        0x00, // Session ID length
        0x00, 0x02, // Cipher Suites length
        0xc0, 0x2f, // TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        0x01, // Compression methods length
        0x00, // Null compression
        0x00, 0x00 // Extensions length
    ]);
    return hello;
};

const probe = (host: string, port: number) => {
    return new Promise((resolve) => {
        const socket = net.createConnection(port, host);
        socket.on("connect", () => {
            socket.write(generateClientHello());
        });
        socket.on("data", (data) => {
            // Read ServerHello and hash it
            const hash = crypto.createHash("sha256").update(data).digest("hex").substring(0, 62);
            socket.destroy();
            resolve(hash);
        });
        socket.on("error", () => resolve("00000000000000000000000000000000000000000000000000000000000000"));
        socket.setTimeout(2000, () => {
            socket.destroy();
            resolve("00000000000000000000000000000000000000000000000000000000000000");
        });
    });
};

(async () => {
    console.log(await probe("example.com", 443));
})();
