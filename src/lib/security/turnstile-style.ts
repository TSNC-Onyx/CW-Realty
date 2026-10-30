// The style @marsidev/react-turnstile writes on the Quick Check container (size "flexible",
// appearance "interaction-only"). Style attributes are blocked by the nonce-based policy, so
// production allows exactly this one by its hash (docs/visitor-audit-fixes-plan.md step 3.5,
// owner decision D4). Hard-coded so the policy stays synchronous; turnstile-style.test.ts
// recomputes the hash and checks the library still writes this exact style.

export const TURNSTILE_CONTAINER_STYLE = "min-width:300px;width:100%;height:auto";

export const TURNSTILE_CONTAINER_STYLE_HASH = "'sha256-LahWPp2I2+kbEuI413CzixV0ojfmix96wZ/l1Mu+In8='";
