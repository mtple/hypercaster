/**
 * The browser wallet, used for one thing: approving a new signing key.
 *
 * Hypercast never asks a wallet to send a transaction, switch chains or
 * sign a free-form message, and never sees a private key or recovery
 * phrase. The only requests made are the two listed below.
 */
import { WriteError } from '~/hypersnap/writes/errors';
import type { CustodySigner, TypedData } from '~/hypersnap/writes/keyAdd';
import { fromHex } from '~/hypersnap/writes/proto';

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** The only two things this module can ask a wallet to do. */
type AllowedMethod = 'eth_requestAccounts' | 'eth_signTypedData_v4';

function injectedProvider(): Eip1193Provider | null {
  const candidate = (globalThis as { ethereum?: unknown }).ethereum;
  return typeof candidate === 'object' &&
    candidate !== null &&
    typeof (candidate as Eip1193Provider).request === 'function'
    ? (candidate as Eip1193Provider)
    : null;
}

const USER_REJECTED = 4001;

async function ask(
  provider: Eip1193Provider,
  method: AllowedMethod,
  params: unknown[],
): Promise<unknown> {
  try {
    return await provider.request({ method, params });
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === USER_REJECTED) {
      throw new WriteError(
        'rejected',
        'You declined the request in your wallet',
      );
    }
    const detail =
      error instanceof Error && error.message ? `: ${error.message}` : '';
    throw new WriteError(
      'unsupported',
      `The wallet could not do that${detail}`,
    );
  }
}

/** Asks the wallet which address it will act as. */
async function connectWallet(provider: Eip1193Provider): Promise<string> {
  const accounts = await ask(provider, 'eth_requestAccounts', []);
  const address = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new WriteError('unsupported', 'The wallet did not share an address');
  }
  return address.toLowerCase();
}

/** A custody signer backed by the wallet's typed-data prompt. */
function walletCustodySigner(
  provider: Eip1193Provider,
  address: string,
): CustodySigner {
  return {
    address,
    async signTypedData(typedData: TypedData) {
      const signature = await ask(provider, 'eth_signTypedData_v4', [
        address,
        JSON.stringify(typedData),
      ]);
      if (
        typeof signature !== 'string' ||
        !/^0x[0-9a-fA-F]+$/.test(signature)
      ) {
        throw new WriteError('unsupported', 'The wallet returned no signature');
      }
      return fromHex(signature);
    },
  };
}

export { connectWallet, injectedProvider, walletCustodySigner };
export type { Eip1193Provider };
