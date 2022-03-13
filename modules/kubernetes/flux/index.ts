import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { resolve } from "path";

import { provider } from "../cluster";

export const flux = new k8s.helm.v3.Release(
  "flux",
  {
    name: "flux",
    namespace: "flux-system",
    chart: "flux2",
    version: "0.14.0",
    createNamespace: true,
    repositoryOpts: {
      repo: "https://fluxcd-community.github.io/helm-charts"
    }
  },
  { provider }
);

const fluxConfig = new pulumi.Config("flux");
const ageKey = fluxConfig.requireSecret("agekey");

const ageKeySecret = new k8s.core.v1.Secret(
  "age-key",
  {
    metadata: {
      name: "sops-age",
      namespace: "flux-system"
    },
    stringData: {
      "age.agekey": ageKey.apply((a) => a)
    }
  },
  { provider, dependsOn: [flux], parent: flux }
);

const fluxRootApp = new k8s.kustomize.Directory(
  "flux-base",
  {
    directory: `${resolve(".")}/cluster/bootstrap`
  },
  { provider, dependsOn: [ageKeySecret], parent: flux }
);
