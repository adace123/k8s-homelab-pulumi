import * as pulumi from "@pulumi/pulumi";

import { fluxInfraKustomization, fluxSourceKustomization } from "./flux";
import { cluster } from "./kind/";
import { VaultSetup } from "./vault/setup";

const vaultConfig = new pulumi.Config("vault");
const keyShares = vaultConfig.getNumber("key-shares") || 5;
const keyThreshold = vaultConfig.getNumber("key-threshold") || 3;
const vaultAddr = new URL(vaultConfig.require("ingress-host"));

const vaultSetup = new VaultSetup("k8s-vault-config", {
  keyShares,
  keyThreshold,
  vaultAddr
});

export default {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  fluxSourceKustomization,
  fluxInfraKustomization,
  vaultToken: vaultSetup.credentials.root_token
};
