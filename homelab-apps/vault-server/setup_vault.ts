import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { VaultRootCredentials } from "./types";

function getVaultRootCredentialsFromFile(): VaultRootCredentials {
  const vaultFileContent = readFileSync(resolve("./vault.json")).toString();
  return JSON.parse(vaultFileContent);
}

function unsealVault(vaultRootCredentials: VaultRootCredentials) {
  const keyThreshold = parseInt(process.env["VAULT_KEY_THRESHOLD"] as string);
  for (let i = 0; i < keyThreshold; i++) {
    execSync(
      `kubectl exec -n vault vault-0 -- vault operator unseal ${vaultRootCredentials.unseal_keys_b64[i]}`
    );
  }
}

async function initializeVault(): Promise<VaultRootCredentials> {
  let num_attempts = 5;
  while (true) {
    try {
      const vaultInitResult = execSync(
        `
    		kubectl exec -n vault vault-0 \
    		-- vault operator init \
    		-key-shares=${process.env["VAULT_KEY_SHARES"]} \
    		-key-threshold=${process.env["VAULT_KEY_THRESHOLD"]} -format=json
    		`
      );
      process.stdout.write(vaultInitResult.toString());
      writeFileSync(`${resolve("./vault.json")}`, vaultInitResult.toString());
      return JSON.parse(vaultInitResult.toString());
    } catch (error) {
      console.error(error);
      if (num_attempts === 0) {
        throw error;
      }

      num_attempts -= 1;
      setTimeout((_) => {}, 5000);
    }
  }
}

(async () => {
  const vaultSealResponse = JSON.parse(
    execSync(
      "kubectl exec -n vault vault-0 -- vault status -format=json"
    ).toString()
  );
  if (vaultSealResponse.status !== 200) {
    throw new Error(
      `Failed to get Vault seal status: ${vaultSealResponse.data}`
    );
  }

  let vaultRootCredentials = null;
  if (!vaultSealResponse.data.initialized) {
    vaultRootCredentials = await initializeVault();
  }

  if (vaultSealResponse.data.sealed) {
    vaultRootCredentials =
      vaultRootCredentials || getVaultRootCredentialsFromFile();
    unsealVault(vaultRootCredentials);
  } else if (!existsSync(resolve("./vault.json"))) {
    throw new Error("Vault root credentials not found!");
  }
})();
