import { Router, Request, Response } from "express";
import { A2AService, SafetyCertificate } from "../services/a2aService";
import { ChannelRouter } from "../core/channelRouter";
import crypto from "crypto";

export const a2aRouter = Router();

/**
 * Programmatic A2A Task Delegation Gateway
 * POST /api/v1/a2a/delegate
 */
a2aRouter.post("/delegate", async (req: Request, res: Response) => {
  try {
    const { intent, safetyCertificate, payloadSignature } = req.body;

    if (!intent || !safetyCertificate) {
      return res.status(400).json({ error: "Missing intent or safetyCertificate" });
    }

    const cert = safetyCertificate as SafetyCertificate;

    // 1. Safety Handshake Alignment & Capability Check
    const isHandshakeValid = await A2AService.validateHandshake(cert);
    if (!isHandshakeValid) {
      return res.status(400).json({ error: "A2A REJECTION: Safety Handshake failed. Alignment proof is insufficient." });
    }

    // 2. Cryptographic Ed25519 Payload Signature check
    if (cert.publicKey && payloadSignature) {
      const isSigValid = A2AService.verifyPayloadSignature(cert.publicKey, payloadSignature, intent);
      if (!isSigValid) {
        return res.status(401).json({ error: "A2A REJECTION: Cryptographic signature verification failed." });
      }
    } else {
      return res.status(401).json({ error: "⚠️ A2A REJECTION: Missing cryptographic signature or public key." });
    }

    // 3. Pre-validate intent path scopes for lead shielding protection
    if (cert.allowedPaths && cert.allowedPaths.length > 0) {
      // Analyze the intent for unauthorized directory references
      const lowerIntent = intent.toLowerCase();
      // If the intent contains a drive/path, ensure it is within the allowedPaths
      const pathPattern = /(?:[a-zA-Z]:[\\\/]+|[\/])[\w\-\.\\\/]+/g;
      const pathsInIntent = lowerIntent.match(pathPattern) || [];
      
      for (const p of pathsInIntent) {
        const isPathAllowed = A2AService.validateRequestScope(cert, p, undefined);
        if (!isPathAllowed) {
          return res.status(403).json({ error: `⛔ A2A REJECTION: Security Scoping Violation for path '${p}'` });
        }
      }
    }

    console.log(`🤖 [A2A Gateway] Authenticated delegation from remote agent: '${cert.agentId}'`);

    // 4. Stream task execution through the central ChannelRouter
    const result = await ChannelRouter.route({
      userId: cert.agentId,
      intent: intent,
      channel: "api",
      executionMode: "api",
      a2aCertificate: cert
    });

    const outcomeString = typeof result === "string" 
      ? result 
      : (result.message || JSON.stringify(result));

    // 5. Synthesize the Cryptographically Signed Audit Trail Execution Log
    const auditTrail = {
      agentId: cert.agentId,
      intent,
      outcome: outcomeString,
      timestamp: new Date().toISOString(),
      host: "MidpointX Sovereign OS V2"
    };

    // Generate a secure one-off or host-derived Ed25519 signing keypair for the response ledger
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    const trailBuffer = Buffer.from(JSON.stringify(auditTrail));
    const signature = crypto.sign(undefined, trailBuffer, privateKey).toString("hex");
    const hostPublicKey = publicKey.export({ format: "der", type: "spki" }).toString("hex");

    res.json({
      success: true,
      auditTrail,
      signature,
      hostPublicKey
    });

  } catch (err: any) {
    console.error("❌ [A2A Gateway] Delegation failure:", err.message);
    res.status(500).json({ error: err.message });
  }
});
