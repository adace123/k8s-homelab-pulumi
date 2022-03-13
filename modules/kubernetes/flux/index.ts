import { Command } from "@pulumi/command/local";
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
const gitRepoUrl = fluxConfig.require("repo-ssh-url");
const sshKeyPath =
  fluxConfig.getSecret("repo-private-key-path") || "~/.ssh/id_rsa";

const createGithubSecret = new Command(
  "create-github-secret",
  {
    create: pulumi.interpolate`flux create secret git github-secret --url=${gitRepoUrl} --private-key-file=${sshKeyPath}`
  },
  { dependsOn: [flux], parent: flux }
);

const fluxRepos = new k8s.kustomize.Directory(
  "flux-base",
  {
    directory: `${resolve(".")}/cluster/base`
  },
  { provider, dependsOn: [createGithubSecret], parent: flux }
);
