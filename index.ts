import * as pulumi from "@pulumi/pulumi";

import { cluster } from "./modules/kubernetes/cluster";
import {
  fluxInfraKustomization,
  fluxSourceKustomization
} from "./modules/kubernetes/flux";
import { VaultSetup } from "./modules/kubernetes/vault/setup";

const vaultConfig = new pulumi.Config("vault");
const keyShares = vaultConfig.getNumber("key-shares") || 5;
const keyThreshold = vaultConfig.getNumber("key-threshold") || 3;
const vaultAddr = new URL(vaultConfig.require("ingress-host"));

const vaultSetup = new VaultSetup("k8s-vault-config", {
  keyShares,
  keyThreshold,
  vaultAddr
});

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  fluxSourceKustomization,
  fluxInfraKustomization,
  vaultToken: vaultSetup.credentials.root_token
};
