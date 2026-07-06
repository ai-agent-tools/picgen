import type { Protocol, ProviderCapability } from "../types.js";

export function defaultCapabilitiesForProtocol(protocol: Protocol): ProviderCapability[] {
  return protocol === "gemini"
    ? ["text-to-image", "reference-image", "multi-reference-image", "mask-guided-edit"]
    : [
        "text-to-image",
        "reference-image",
        "multi-reference-image",
        "mask-guided-edit",
        "native-inpaint"
      ];
}
