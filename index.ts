import * as pulumi from "@pulumi/pulumi";

import { cluster } from "./modules/kubernetes/cluster";
import { fluxRepoKustomization } from "./modules/kubernetes/flux";

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  fluxRepoKustomization: fluxRepoKustomization.resources
  // vaultToken: vaultServer.credentials.root_token,
};
