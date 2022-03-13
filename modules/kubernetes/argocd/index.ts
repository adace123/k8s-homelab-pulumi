import * as k8s from "@pulumi/kubernetes";
import { resolve } from "path";

import { provider } from "../cluster";

export const argocd = new k8s.helm.v3.Release(
  "argocd",
  {
    name: "argocd",
    namespace: "argocd",
    repositoryOpts: {
      repo: "https://argoproj.github.io/argo-helm"
    },
    version: "3.35.4",
    chart: "argo-cd",
    createNamespace: true
  },
  { provider }
);

const rootApp = new k8s.yaml.ConfigFile(
  "argocd-app",
  {
    file: `${resolve(".")}/modules/kubernetes/argocd/root.yaml`
  },
  { provider, dependsOn: [argocd], parent: argocd }
);
