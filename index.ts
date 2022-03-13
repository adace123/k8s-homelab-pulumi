import * as pulumi from "@pulumi/pulumi";

import { cluster } from "./modules/kubernetes/cluster";
// import { traefik, vaultServer } from './modules/kubernetes/';
// import { argocd } from "./modules/kubernetes/argocd";
import { flux } from "./modules/kubernetes/flux";

export = {
  kubeconfig: pulumi.secret(cluster.kubeConfig),
  flux
  // vaultToken: vaultServer.credentials.root_token,
  // argoCD: argocd
};
