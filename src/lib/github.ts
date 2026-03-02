import { Octokit } from "@octokit/rest";

export const getGitHubClient = (token: string) => {
  return new Octokit({ auth: token });
};

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  default_branch: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

export const fetchRepos = async (token: string): Promise<Repo[]> => {
  const octokit = getGitHubClient(token);
  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: "pushed",
    per_page: 100,
  });
  // @ts-ignore
  return data as Repo[];
};

export const getRepo = async (
  token: string,
  owner: string,
  repo: string,
): Promise<Repo> => {
  const octokit = getGitHubClient(token);
  const { data } = await octokit.repos.get({
    owner,
    repo,
  });
  return data as Repo;
};
