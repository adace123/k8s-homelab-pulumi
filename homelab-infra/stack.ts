import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

import { clusterProvider } from "./cluster-provider";
import { operatorDeployment } from "./pulumi-operator";

const config = new pulumi.Config();
const pulumiAccessToken = config.requireSecret("pulumiAccessToken");
const githubToken = config.requireSecret("githubToken");

const pulumiSecret = new k8s.core.v1.Secret(
  "pulumi-secret",
  {
    metadata: {
      name: "pulumi-secret"
    },
    stringData: {
      accessToken: pulumiAccessToken
    }
  },
  { provider: clusterProvider }
);

const githubSecret = new k8s.core.v1.Secret(
  "github-secret",
  {
    metadata: {
      name: "github-secret"
    },
    stringData: {
      token: githubToken
    }
  },
  { provider: clusterProvider }
);

export const homelabAppStack = new k8s.apiextensions.CustomResource(
  "homelab-app-stack",
  {
    apiVersion: "pulumi.com/v1",
    kind: "Stack",
    metadata: {
      name: "homelab-apps"
    },
    spec: {
      stack: "apps-dev",
      repoDir: "homelab-apps",
      projectRepo: "https://github.com/adace123/k8s-homelab-pulumi",
      branch: "refs/heads/main",
      destroyOnFinalize: true,
      accessTokenSecret: pulumiSecret.metadata.name,
      gitAuth: {
        accessToken: {
          type: "Secret",
          secret: {
            name: githubSecret.metadata.name,
            key: "token"
          }
        }
      }
    }
  },
  { provider: clusterProvider, dependsOn: [operatorDeployment] }
);
