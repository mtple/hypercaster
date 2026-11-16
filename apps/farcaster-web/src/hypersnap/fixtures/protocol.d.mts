export type DecodedMessage = {
  kind:
    | 'castAdd'
    | 'castRemove'
    | 'reactionAdd'
    | 'reactionRemove'
    | 'linkAdd'
    | 'linkRemove'
    | 'keyAdd'
    | 'keyRemove';
  fid: string;
  timestamp: number;
  network: number;
  // Shape depends on `kind`; tests read the fields they expect.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  hash: string;
  signer: Uint8Array;
  signature: Uint8Array;
  dataBytes: Uint8Array;
  signerHex?: string;
  custodyAddress?: string;
  requestFid?: string;
};

export function decodeMessage(bytes: Uint8Array): DecodedMessage;

export function checkMessage(
  bytes: Uint8Array,
): Promise<
  { ok: true; message: DecodedMessage } | { ok: false; reason: string }
>;
