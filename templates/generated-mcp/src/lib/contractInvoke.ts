import { Spec } from "@stellar/stellar-sdk/contract";
import { Account, Contract, Keypair, rpc, TransactionBuilder } from "@stellar/stellar-sdk";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "./errors.js";
import { redactSensitiveText, sanitizeDebugPayload } from "./redact.js";
import { createStellarClients } from "./stellarClient.js";
import { isUnsignedSigningMode } from "./policy.js";

export type InvokeToolResult =
  | { content: Array<{ type: "text"; text: string }> }
  | { isError: true; content: Array<{ type: "text"; text: string }> };

export async function invokeContractMethod(
  config: AppConfig,
  spec: Spec,
  params: {
    contractId: string;
    sourceAccount: string;
    method: string;
    args: Record<string, unknown>;
  }
): Promise<InvokeToolResult> {
  try {
    const stellar = createStellarClients(config);
    const contract = new Contract(params.contractId);
    const scArgs = spec.funcArgsToScVals(params.method, params.args);
    const call = contract.call(params.method, ...scArgs);

    let account;
    try {
      account = await stellar.runHorizon(
        stellar.horizon.loadAccount(params.sourceAccount),
        "load_source_account"
      );
    } catch {
      account = new Account(params.sourceAccount, "0");
    }

    const builder = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: stellar.networkPassphrase
    });

    builder.addOperation(call);
    builder.setTimeout(30);

    const tx = builder.build();

    const simulation = await stellar.runRpc(
      stellar.rpc.simulateTransaction(tx),
      "simulate_transaction"
    );

    if (rpc.Api.isSimulationError(simulation)) {
      throw new Error(`Simulation failed: ${simulation.error}`);
    }

    const preparedTxBuilder = rpc.assembleTransaction(tx, simulation);
    const preparedTx = preparedTxBuilder.build();

    const unsignedMode = isUnsignedSigningMode(config);

    if (!unsignedMode && config.secretKey) {
      preparedTx.sign(Keypair.fromSecret(config.secretKey));
    }

    if (unsignedMode || !config.secretKey) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "unsigned",
                message:
                  "Transaction requires signatures. Sign assembled XDR (includes Soroban footprints) or enable signing policy + STELLAR_SECRET_KEY.",
                unsignedXdr: preparedTx.toXDR()
              },
              null,
              2
            )
          }
        ]
      };
    }

    const submission = await stellar.runRpc(
      stellar.rpc.sendTransaction(preparedTx),
      "submit_soroban_transaction"
    );

    let nativeResult: unknown = null;
    try {
      const success = simulation as { result?: { retval?: unknown } };
      if (success.result?.retval) {
        nativeResult = spec.funcResToNative(params.method, success.result.retval as never);
      }
    } catch {
      nativeResult = null;
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: submission.status,
              hash: submission.hash,
              errorResultXdr: submission.errorResult?.toXDR("base64") ?? null,
              resultPreview: nativeResult,
              _debug: sanitizeDebugPayload({
                contractId: params.contractId,
                method: params.method,
                networkPassphrase: stellar.networkPassphrase
              })
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    const mapped = normalizeStellarError(error);
    return {
      isError: true,
      content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
    };
  }
}
