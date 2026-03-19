import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  Account,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  rpc,
  xdr,
  nativeToScVal
} from "@stellar/stellar-sdk";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { normalizeStellarError } from "../lib/errors.js";
import { createStellarClients } from "../lib/stellar.js";
import { redactSensitiveText, sanitizeDebugPayload } from "../lib/redact.js";

const invokeSorobanSchema = {
  contractId: z.string().describe("Soroban contract ID (C...)"),
  method: z.string().describe("Contract method name to invoke"),
  sourceAccount: z.string().describe("Source account public key (G...) to use for simulation."),
  args: z
    .array(
      z.object({
        type: z.enum([
          "u32",
          "i32",
          "u64",
          "i64",
          "u128",
          "i128",
          "u256",
          "i256",
          "string",
          "symbol",
          "address",
          "bool"
        ]),
        value: z.any()
      })
    )
    .optional()
    .describe("List of arguments for the contract invocation.")
};

// Helper for minimal native-to-ScVal mapping
function parseArgToScVal(type: string, value: any): xdr.ScVal {
  switch (type) {
    case "u32":
    case "i32":
      return nativeToScVal(Number(value), { type });
    case "u64":
    case "i64":
    case "u128":
    case "i128":
    case "u256":
    case "i256":
      return nativeToScVal(BigInt(value), { type: type as any });
    case "string":
    case "symbol":
    case "address":
    case "bool":
      return nativeToScVal(value, { type: type as any });
    default:
      throw new Error(`Unsupported argument type: ${type}`);
  }
}

export function registerSorobanTools(server: McpServer, config: AppConfig): void {
  server.tool(
    "stellar_soroban_simulate",
    "Simulate a Soroban smart contract invocation to get footprint, events, and results. Does NOT submit transaction.",
    invokeSorobanSchema,
    async ({ contractId, method, sourceAccount, args }) => {
      try {
        const stellar = createStellarClients(config);

        const contract = new Contract(contractId);

        let scArgs: xdr.ScVal[] = [];
        if (args && args.length > 0) {
          scArgs = args.map(arg => parseArgToScVal(arg.type, arg.value));
        }

        const call = contract.call(method, ...scArgs);

        let account;
        try {
          account = await stellar.runHorizon(
            stellar.horizon.loadAccount(sourceAccount),
            "load_source_account"
          );
        } catch {
          account = new Account(sourceAccount, "0");
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

        const successSim = simulation as any;

        const result = {
          results: successSim.result?.retval ? [successSim.result.retval.toXDR("base64")] : [],
          footprint: successSim.transactionData ? successSim.transactionData.build().toXDR("base64") : null,
          minResourceFee: successSim.minResourceFee,
          events: successSim.events?.map((e: any) => e.toXDR("base64")) || [],
          _debug: sanitizeDebugPayload({
            contractId,
            method,
            networkPassphrase: stellar.networkPassphrase
          })
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        const mapped = normalizeStellarError(error);
        return {
          isError: true,
          content: [{ type: "text", text: redactSensitiveText(mapped.message) }]
        };
      }
    }
  );

  server.tool(
    "stellar_soroban_invoke",
    "Invoke a Soroban smart contract. Simulates the transaction, extracts the footprint, and submits it to the network if policy allows.",
    invokeSorobanSchema,
    async ({ contractId, method, sourceAccount, args }) => {
      try {
        const stellar = createStellarClients(config);

        const contract = new Contract(contractId);

        let scArgs: xdr.ScVal[] = [];
        if (args && args.length > 0) {
          scArgs = args.map(arg => parseArgToScVal(arg.type, arg.value));
        }

        const call = contract.call(method, ...scArgs);

        const account = await stellar.runHorizon(
          stellar.horizon.loadAccount(sourceAccount),
          "load_source_account"
        );

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

        const isUnsignedMode =
          config.autoSignPolicy === "safe" ||
          (config.autoSignPolicy === "guarded" && config.autoSignLimit === 0) ||
          (!config.autoSignPolicy && !config.autoSign);

        if (!isUnsignedMode && config.secretKey) {
          preparedTx.sign(Keypair.fromSecret(config.secretKey));
        }

        if (isUnsignedMode || !config.secretKey) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "unsigned",
                  message:
                    "Transaction requires signatures. Please sign this assembled XDR (it already includes Soroban footprints).",
                  unsignedXdr: preparedTx.toXDR()
                }, null, 2)
              }
            ]
          };
        }

        const submission = await stellar.runRpc(
          stellar.rpc.sendTransaction(preparedTx),
          "submit_soroban_transaction"
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: submission.status,
                hash: submission.hash,
                errorResultXdr: submission.errorResult?.toXDR("base64") || null,
                _debug: sanitizeDebugPayload({
                  contractId,
                  method,
                  networkPassphrase: stellar.networkPassphrase
                })
              }, null, 2)
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
  );

  server.tool(
    "stellar_soroban_read_state",
    "Read the state of a specific contract data entry directly from the ledger without simulating a transaction.",
    {
      contractId: z.string().describe("Soroban contract ID (C...)"),
      keyType: z.enum([
        "u32", "i32", "u64", "i64", "u128", "i128", "u256", "i256", "string", "symbol", "address", "bool"
      ]).describe("The ScVal type of the ledger key"),
      keyValue: z.any().describe("The value of the ledger key")
    },
    async ({ contractId, keyType, keyValue }) => {
      try {
        const stellar = createStellarClients(config);

        const scValKey = parseArgToScVal(keyType, keyValue);

        const ledgerKey = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Contract(contractId).address().toScAddress(),
            key: scValKey,
            durability: xdr.ContractDataDurability.persistent(),
          })
        );

        const response = await stellar.runRpc(
          stellar.rpc.getLedgerEntries(ledgerKey),
          "get_ledger_entries"
        );

        if (!response.entries || response.entries.length === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({ found: false, valueXdr: null }) }]
          };
        }

        const entry = response.entries[0].val;
        const contractData = entry.contractData();
        const value = contractData.val();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found: true,
                valueXdr: value.toXDR("base64"),
                _debug: sanitizeDebugPayload({
                  contractId,
                  keyType
                })
              }, null, 2)
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
  );
}
