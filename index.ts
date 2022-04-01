import * as pulumi from "@pulumi/pulumi";

import { cluster } from "./modules/kubernetes/cluster";

// import { traefik, vaultServer } from './modules/kubernetes/';
// import { argocd } from "./modules/kubernetes/argocd";

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig)
  // vaultToken: vaultServer.credentials.root_token,
};
