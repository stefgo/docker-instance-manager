import { useState } from "react";
import { CONNECTION_MODE, ConnectionMode, Ipv4OrCidrSchema, normaliseTargetAddress } from "@dim/shared";

/**
 * Everything the add-client flow collects, held above the wizard.
 *
 * The wizard renders only the current step, so a step that kept its inputs in its own
 * `useState` would lose them the moment the user went back. Holding the values here makes
 * Back and Next free.
 */
export interface AddClientForm {
    mode: ConnectionMode;
    setMode: (mode: ConnectionMode) => void;

    /** Inbound: what the issued token fixes for the client it will create. */
    displayName: string;
    setDisplayName: (value: string) => void;
    restrictIp: boolean;
    setRestrictIp: (value: boolean) => void;
    allowedIp: string;
    setAllowedIp: (value: string) => void;
    allowedIpInvalid: boolean;

    /** Outbound: where the server dials, and the secret it authenticates with. */
    hostname: string;
    setHostname: (value: string) => void;
    targetAddress: string;
    setTargetAddress: (value: string) => void;
    targetAddressInvalid: boolean;
    registrationSecret: string;
    setRegistrationSecret: (value: string) => void;

    /** Whether the details step holds enough to go on. */
    canContinue: boolean;
}

export function useAddClientForm(): AddClientForm {
    const [mode, setMode] = useState<ConnectionMode>(CONNECTION_MODE.INBOUND);

    const [displayName, setDisplayName] = useState("");
    const [restrictIp, setRestrictIp] = useState(false);
    const [allowedIp, setAllowedIp] = useState("");

    const [hostname, setHostname] = useState("");
    const [targetAddress, setTargetAddress] = useState("");
    const [registrationSecret, setRegistrationSecret] = useState("");

    // The same rules the endpoints apply, from the same schemas, so a value is refused in
    // the field rather than after a round trip.
    const allowedIpTrimmed = allowedIp.trim();
    const allowedIpInvalid =
        restrictIp &&
        allowedIpTrimmed.length > 0 &&
        !Ipv4OrCidrSchema.safeParse(allowedIpTrimmed).success;

    const targetAddressTrimmed = targetAddress.trim();
    const targetAddressInvalid =
        targetAddressTrimmed.length > 0 &&
        normaliseTargetAddress(targetAddressTrimmed) === null;

    const canContinue =
        mode === CONNECTION_MODE.INBOUND
            ? !allowedIpInvalid && (!restrictIp || allowedIpTrimmed.length > 0)
            : !targetAddressInvalid &&
              targetAddressTrimmed.length > 0 &&
              registrationSecret.trim().length > 0;

    return {
        mode,
        setMode,
        displayName,
        setDisplayName,
        restrictIp,
        setRestrictIp,
        allowedIp,
        setAllowedIp,
        allowedIpInvalid,
        hostname,
        setHostname,
        targetAddress,
        setTargetAddress,
        targetAddressInvalid,
        registrationSecret,
        setRegistrationSecret,
        canContinue,
    };
}
