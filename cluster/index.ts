import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { operatorDeployment } from "./operator";
import { clusterProvider } from "./provider";

const pulumiConfig = new pulumi.Config();
const pulumiAccessToken = pulumiConfig.requireSecret("pulumiAccessToken");

const pulumiSecret = new k8s.core.v1.Secret(
  "pulumi-access-token",
  {
    metadata: {
      name: "pulumi-access-token"
    },
    stringData: {
      accessToken: pulumiAccessToken
    }
  },
  { provider: clusterProvider }
);

const stack = new k8s.apiextensions.CustomResource(
  "k8s-app-stack",
  {
    apiVersion: "pulumi.com/v1",
    kind: "Stack",
    spec: {
      stack: "dev",
      projectRepo: "https://github.com/adace123/k8s-pulumi",
      branch: "main",
      accessTokenSecret: pulumiSecret.metadata.name,
      destroyOnFinalize: true,
      repoDir: "apps"
    }
  },
  { provider: clusterProvider, dependsOn: [operatorDeployment] }
);
