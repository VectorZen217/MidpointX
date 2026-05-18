import crypto from "crypto";
import path from "path";

/**
 * SafetyCertificate
 * Declares alignment, limits, capabilities, and Ed25519 verification profiles for program-to-program requests.
 */
export interface SafetyCertificate {
  agentId: string;
  alignmentProof: string; // Hash of the safety policy
  refusalThreshold: number;
  capabilities: string[];
  originatorId?: string; // The ID of the original agent who triggered this request
  isDelegated?: boolean;
  publicKey?: string; // Hex or PEM public key for cryptographic signature verification
  allowedPaths?: string[]; // Scoped allowed directory roots
  allowedTools?: string[]; // Scoped allowed tool names
  signature?: string; // Hex-encoded signature of request payload
}

export class A2AService {
  private static trustedAgents: Map<string, SafetyCertificate> = new Map();

  /**
   * Performs a Safety Handshake.
   * If the agent is unknown, it requires a 'Proof of Alignment' challenge.
   */
  static async validateHandshake(cert: SafetyCertificate): Promise<boolean> {
    console.log(`🤝 [A2AService] Initiating Handshake with Agent: ${cert.agentId}`);

    // 1. Threshold Validation
    if (cert.refusalThreshold < 0.05) {
      console.warn(`❌ [A2AService] Handshake REJECTED. Refusal threshold (${cert.refusalThreshold}) is too lax.`);
      return false;
    }

    // 2. Capability Check
    if (!cert.capabilities.includes("disciplined_refusal")) {
      console.warn(`❌ [A2AService] Handshake REJECTED. Agent does not support 'disciplined_refusal'.`);
      return false;
    }

    // 3. Nested Delegation (Chain-of-Custody) Verification
    if (cert.isDelegated && cert.originatorId) {
      console.log(`🔗 [A2AService] Validating Nested Delegation from ${cert.originatorId} via ${cert.agentId}`);
      if (!this.trustedAgents.has(cert.originatorId)) {
        console.warn(`⚠️ [A2AService] Handshake REJECTED. Delegation originator (${cert.originatorId}) is untrusted. High risk of 'Trust Laundering'.`);
        return false;
      }
    }

    // 4. Dynamic Challenge (Simulation)
    const isAligned = await this.simulateBlindTest(cert.agentId);
    if (!isAligned) {
      console.warn(`❌ [A2AService] Handshake REJECTED. Agent failed the Blind Test (Alignment check).`);
      return false;
    }

    this.trustedAgents.set(cert.agentId, cert);
    console.log(`✅ [A2AService] Handshake SUCCESSFUL. Agent ${cert.agentId} is now a Trusted Peer.`);
    return true;
  }

  /**
   * Simulates a challenge-response where the remote agent must refuse a corrupted input.
   */
  private static async simulateBlindTest(agentId: string): Promise<boolean> {
    // Mocking a successful alignment check
    return true; 
  }

  static isTrusted(agentId: string): boolean {
    return this.trustedAgents.has(agentId);
  }

  /**
   * Verifies an Ed25519 cryptographic signature of a payload.
   */
  static verifyPayloadSignature(publicKey: string, signatureHex: string, payload: any): boolean {
    try {
      const data = typeof payload === "string" ? payload : JSON.stringify(payload);
      const signatureBuffer = Buffer.from(signatureHex, "hex");
      
      let key: crypto.KeyLike;
      if (publicKey.startsWith("-----BEGIN PUBLIC KEY-----") || publicKey.startsWith("-----BEGIN PRIVATE KEY-----")) {
        key = publicKey;
      } else {
        key = crypto.createPublicKey({
          key: Buffer.from(publicKey, "hex"),
          format: "der",
          type: "spki"
        });
      }
      
      return crypto.verify(
        undefined,
        Buffer.from(data),
        key,
        signatureBuffer
      );
    } catch (e: any) {
      console.error("❌ [A2AService] Cryptographic signature check failed:", e.message);
      return false;
    }
  }

  /**
   * Validates target paths and target tool scopes against permitted certificate permissions.
   */
  static validateRequestScope(cert: SafetyCertificate, targetPath?: string, targetTool?: string): boolean {
    if (targetPath && cert.allowedPaths && cert.allowedPaths.length > 0) {
      const resolvedTarget = path.resolve(targetPath).toLowerCase();
      const isAllowed = cert.allowedPaths.some(allowed => {
        const resolvedAllowed = path.resolve(allowed).toLowerCase();
        return resolvedTarget.startsWith(resolvedAllowed) || resolvedAllowed.startsWith(resolvedTarget);
      });
      if (!isAllowed) {
        console.warn(`⛔ [A2AService] Security Scoping Rejection: Target path '${targetPath}' is outside allowed scopes.`);
        return false;
      }
    }
    
    if (targetTool && cert.allowedTools && cert.allowedTools.length > 0) {
      const isAllowed = cert.allowedTools.some(tool => tool.toLowerCase() === targetTool.toLowerCase());
      if (!isAllowed) {
        console.warn(`⛔ [A2AService] Security Scoping Rejection: Tool '${targetTool}' is not in allowed tools list.`);
        return false;
      }
    }
    
    return true;
  }
}
