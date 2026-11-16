import { useId, type CSSProperties } from "react";

// A password box that browsers and password managers (Google Password Manager, iCloud
// Keychain, LastPass, 1Password, Bitwarden, Dashlane) don't fill in or offer to save, for
// re-confirming the password before a sensitive action. It is a plain text field masked with
// -webkit-text-security, with a fresh name on every use and the managers' "ignore" markers.
// Browsers without that masking get type="password" with autoComplete="new-password"
// (the strongest hint those browsers honour). Copy and cut are blocked.

const MASK_SUPPORTED =
    typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-text-security", "disc");

export function ConfidentialPasswordInput({
    value,
    onChange,
    className,
    placeholder,
    disabled,
    ariaLabel,
}: {
    value: string;
    onChange: (value: string) => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
}) {
    const name = `confirm-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    return (
        <input
            type={MASK_SUPPORTED ? "text" : "password"}
            name={name}
            id={name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={MASK_SUPPORTED ? "off" : "new-password"}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="text"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            aria-label={ariaLabel}
            placeholder={placeholder}
            disabled={disabled}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            style={MASK_SUPPORTED ? ({ WebkitTextSecurity: "disc" } as CSSProperties) : undefined}
            className={className}
        />
    );
}
