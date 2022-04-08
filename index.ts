import * as pulumi from "@pulumi/pulumi";

import { cluster } from "./modules/kubernetes/cluster";
import {
  fluxInfraKustomization,
  fluxRepoKustomization
} from "./modules/kubernetes/flux";

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  fluxRepoKustomization,
  fluxInfraKustomization
  // vaultToken: vaultServer.credentials.root_token,
};
