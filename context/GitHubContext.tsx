import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
  public_repos: number;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
  description: string | null;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  author: { login: string; avatar_url: string } | null;
}

interface GitHubContextType {
  token: string | null;
  user: GitHubUser | null;
  repos: GitHubRepo[];
  selectedRepo: GitHubRepo | null;
  branches: GitHubBranch[];
  currentBranch: string;
  commits: GitHubCommit[];
  loading: boolean;
  reposLoading: boolean;
  login: (token: string) => Promise<boolean>;
  logout: () => Promise<void>;
  selectRepo: (repo: GitHubRepo | null) => Promise<void>;
  selectBranch: (branch: string) => Promise<void>;
  fetchRepos: () => Promise<void>;
  refreshCommits: () => Promise<void>;
  pushFile: (path: string, content: string, message: string) => Promise<{ ok: boolean; error?: string; strategy?: string }>;
  pushFiles: (
    files: { path: string; content: string }[],
    message: string,
    onProgress?: (done: number, total: number) => void
  ) => Promise<{ ok: boolean; error?: string; pushedCount?: number }>;
  deleteDirectory: (dirPath: string, message: string) => Promise<{ ok: boolean; error?: string; deletedCount?: number }>;
  clearRepo: (message: string) => Promise<{ ok: boolean; error?: string; deletedCount?: number }>;
}

const GitHubContext = createContext<GitHubContextType | null>(null);

const TOKEN_KEY = "@gitcrush_token";
const REPO_KEY = "@gitcrush_repo";
const BRANCH_KEY = "@gitcrush_branch";

const GH_HEADERS = (tok: string) => ({
  Authorization: `token ${tok}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
});

async function ghFetch(tok: string, path: string, options?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...GH_HEADERS(tok), ...(options?.headers ?? {}) },
  });
}

/**
 * Extrait le vrai message d'erreur renvoyé par l'API GitHub (au lieu d'un
 * message générique du style "Échec de X"), pour pouvoir diagnostiquer
 * précisément ce qui a échoué (permissions, SHA obsolète, rate limit, etc.).
 */
async function ghError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; errors?: { message?: string }[] };
    const detail = body.errors?.map((e) => e.message).filter(Boolean).join("; ");
    const msg = [body.message, detail].filter(Boolean).join(" — ");
    return msg ? `${fallback} (HTTP ${res.status}) : ${msg}` : `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

export function GitHubProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("main");
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [reposLoading, setReposLoading] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  async function restoreSession() {
    try {
      const tok = await AsyncStorage.getItem(TOKEN_KEY);
      if (!tok) return;
      const ok = await verifyToken(tok);
      if (!ok) return;
      const repoJson = await AsyncStorage.getItem(REPO_KEY);
      const branchStr = await AsyncStorage.getItem(BRANCH_KEY);
      if (repoJson) {
        const repo = JSON.parse(repoJson) as GitHubRepo;
        setSelectedRepo(repo);
        const branch = branchStr || repo.default_branch;
        setCurrentBranch(branch);
        void loadBranches(tok, repo);
        void loadCommits(tok, repo, branch);
      }
      void loadRepos(tok);
    } finally {
      setLoading(false);
    }
  }

  async function verifyToken(tok: string): Promise<boolean> {
    try {
      const res = await ghFetch(tok, "/user");
      if (!res.ok) return false;
      const u = (await res.json()) as GitHubUser;
      setToken(tok);
      setUser(u);
      return true;
    } catch {
      return false;
    }
  }

  async function login(tok: string): Promise<boolean> {
    const ok = await verifyToken(tok);
    if (ok) {
      await AsyncStorage.setItem(TOKEN_KEY, tok);
      void loadRepos(tok);
    }
    return ok;
  }

  async function logout() {
    await AsyncStorage.multiRemove([TOKEN_KEY, REPO_KEY, BRANCH_KEY]);
    setToken(null);
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
    setBranches([]);
    setCommits([]);
    setCurrentBranch("main");
  }

  async function loadRepos(tok: string) {
    setReposLoading(true);
    try {
      const res = await ghFetch(tok, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator");
      if (res.ok) {
        const data = (await res.json()) as GitHubRepo[];
        setRepos(data);
      }
    } finally {
      setReposLoading(false);
    }
  }

  async function loadBranches(tok: string, repo: GitHubRepo) {
    try {
      const res = await ghFetch(tok, `/repos/${repo.full_name}/branches`);
      if (res.ok) {
        const data = (await res.json()) as GitHubBranch[];
        setBranches(data);
      }
    } catch {/**/ }
  }

  async function loadCommits(tok: string, repo: GitHubRepo, branch: string) {
    try {
      const res = await ghFetch(tok, `/repos/${repo.full_name}/commits?sha=${branch}&per_page=30`);
      if (res.ok) {
        const data = (await res.json()) as GitHubCommit[];
        setCommits(Array.isArray(data) ? data : []);
      } else {
        setCommits([]);
      }
    } catch {
      setCommits([]);
    }
  }

  async function fetchRepos() {
    if (!token) return;
    await loadRepos(token);
  }

  async function refreshCommits() {
    if (!token || !selectedRepo) return;
    await loadCommits(token, selectedRepo, currentBranch);
  }

  async function selectRepo(repo: GitHubRepo | null) {
    setSelectedRepo(repo);
    setCommits([]);
    setBranches([]);
    if (!repo) {
      await AsyncStorage.removeItem(REPO_KEY);
      return;
    }
    await AsyncStorage.setItem(REPO_KEY, JSON.stringify(repo));
    const branch = repo.default_branch;
    setCurrentBranch(branch);
    await AsyncStorage.setItem(BRANCH_KEY, branch);
    if (token) {
      void loadBranches(token, repo);
      void loadCommits(token, repo, branch);
    }
  }

  async function selectBranch(branch: string) {
    setCurrentBranch(branch);
    setCommits([]);
    await AsyncStorage.setItem(BRANCH_KEY, branch);
    if (token && selectedRepo) {
      void loadCommits(token, selectedRepo, branch);
    }
  }

  /**
   * Stratégie 1 — Contents API (PUT /contents/{path})
   * Méthode simple, fonctionne pour la majorité des fichiers (<1 MB).
   */
  async function pushStrategy1(
    tok: string,
    repo: GitHubRepo,
    branch: string,
    path: string,
    content: string,
    message: string
  ): Promise<{ ok: boolean; error?: string }> {
    // Récupérer le SHA du fichier existant si nécessaire
    let sha: string | undefined;
    const checkRes = await ghFetch(tok, `/repos/${repo.full_name}/contents/${path}?ref=${branch}`);
    if (checkRes.ok) {
      const existing = (await checkRes.json()) as { sha: string };
      sha = existing.sha;
    }
    const body: Record<string, string> = { message, content, branch };
    if (sha) body.sha = sha;

    const res = await ghFetch(tok, `/repos/${repo.full_name}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json()) as { message?: string };
    return { ok: false, error: err.message ?? "Erreur Contents API" };
  }

  /**
   * Stratégie 2 — Contents API avec SHA rafraîchi
   * Si la stratégie 1 échoue (conflit de SHA, fichier modifié entre-temps),
   * on refetch le SHA et on réessaie immédiatement.
   */
  async function pushStrategy2(
    tok: string,
    repo: GitHubRepo,
    branch: string,
    path: string,
    content: string,
    message: string
  ): Promise<{ ok: boolean; error?: string }> {
    // Forcer un refetch du SHA frais
    let sha: string | undefined;
    const checkRes = await ghFetch(tok, `/repos/${repo.full_name}/contents/${path}?ref=${branch}&t=${Date.now()}`);
    if (checkRes.ok) {
      const existing = (await checkRes.json()) as { sha: string };
      sha = existing.sha;
    } else if (checkRes.status !== 404) {
      return { ok: false, error: `Impossible de lire le fichier (HTTP ${checkRes.status})` };
    }

    const body: Record<string, string> = { message, content, branch };
    if (sha) body.sha = sha;

    const res = await ghFetch(tok, `/repos/${repo.full_name}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const err = (await res.json()) as { message?: string };
    return { ok: false, error: err.message ?? "Erreur Contents API (retry)" };
  }

  /**
   * Stratégie 3 — Git Data API (blob → tree → commit → ref)
   * Plus robuste : contourne les limites de la Contents API,
   * gère les conflits de SHA et les fichiers binaires correctement.
   */
  async function pushStrategy3(
    tok: string,
    repo: GitHubRepo,
    branch: string,
    path: string,
    content: string,
    message: string
  ): Promise<{ ok: boolean; error?: string }> {
    // 1. Créer le blob avec le contenu base64
    const blobRes = await ghFetch(tok, `/repos/${repo.full_name}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content, encoding: "base64" }),
    });
    if (!blobRes.ok) return { ok: false, error: "Stratégie 3 : impossible de créer le blob" };
    const blobData = (await blobRes.json()) as { sha: string };

    // 2. Récupérer le SHA du commit courant
    const refRes = await ghFetch(tok, `/repos/${repo.full_name}/git/ref/heads/${branch}`);
    if (!refRes.ok) return { ok: false, error: "Stratégie 3 : impossible de lire la branche" };
    const refData = (await refRes.json()) as { object: { sha: string } };
    const commitSha = refData.object.sha;

    // 3. Récupérer le SHA de l'arbre racine
    const commitRes = await ghFetch(tok, `/repos/${repo.full_name}/git/commits/${commitSha}`);
    if (!commitRes.ok) return { ok: false, error: "Stratégie 3 : impossible de lire le commit" };
    const commitData = (await commitRes.json()) as { tree: { sha: string } };

    // 4. Créer un nouvel arbre avec le fichier modifié
    const newTreeRes = await ghFetch(tok, `/repos/${repo.full_name}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: commitData.tree.sha,
        tree: [{ path, mode: "100644", type: "blob", sha: blobData.sha }],
      }),
    });
    if (!newTreeRes.ok) return { ok: false, error: "Stratégie 3 : impossible de créer l'arbre" };
    const newTreeData = (await newTreeRes.json()) as { sha: string };

    // 5. Créer le commit
    const newCommitRes = await ghFetch(tok, `/repos/${repo.full_name}/git/commits`, {
      method: "POST",
      body: JSON.stringify({ message, tree: newTreeData.sha, parents: [commitSha] }),
    });
    if (!newCommitRes.ok) return { ok: false, error: "Stratégie 3 : impossible de créer le commit" };
    const newCommitData = (await newCommitRes.json()) as { sha: string };

    // 6. Mettre à jour la référence de la branche
    const updateRes = await ghFetch(tok, `/repos/${repo.full_name}/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommitData.sha }),
    });
    if (!updateRes.ok) return { ok: false, error: "Stratégie 3 : impossible de mettre à jour la branche" };
    return { ok: true };
  }

  /**
   * pushFile — essaie les 3 stratégies dans l'ordre.
   * Retourne aussi le nom de la stratégie ayant réussi.
   */
  async function pushFile(
    path: string,
    content: string,
    message: string
  ): Promise<{ ok: boolean; error?: string; strategy?: string }> {
    if (!token || !selectedRepo) return { ok: false, error: "Non authentifié" };

    const errors: string[] = [];

    // Stratégie 1
    try {
      const r1 = await pushStrategy1(token, selectedRepo, currentBranch, path, content, message);
      if (r1.ok) {
        void loadCommits(token, selectedRepo, currentBranch);
        return { ok: true, strategy: "1" };
      }
      errors.push(`S1: ${r1.error}`);
    } catch (e) {
      errors.push(`S1: ${String(e)}`);
    }

    // Stratégie 2 (refetch SHA)
    try {
      const r2 = await pushStrategy2(token, selectedRepo, currentBranch, path, content, message);
      if (r2.ok) {
        void loadCommits(token, selectedRepo, currentBranch);
        return { ok: true, strategy: "2" };
      }
      errors.push(`S2: ${r2.error}`);
    } catch (e) {
      errors.push(`S2: ${String(e)}`);
    }

    // Stratégie 3 (Git Data API)
    try {
      const r3 = await pushStrategy3(token, selectedRepo, currentBranch, path, content, message);
      if (r3.ok) {
        void loadCommits(token, selectedRepo, currentBranch);
        return { ok: true, strategy: "3" };
      }
      errors.push(`S3: ${r3.error}`);
    } catch (e) {
      errors.push(`S3: ${String(e)}`);
    }

    return {
      ok: false,
      error: `Toutes les stratégies ont échoué :\n${errors.join("\n")}`,
    };
  }

  /**
   * pushFiles — pousse PLUSIEURS fichiers en UN SEUL commit via la Git Data
   * API : tous les blobs sont créés en parallèle, puis un seul arbre + un
   * seul commit + une seule mise à jour de branche. C'est la technique la
   * plus rapide pour un import groupé (ex: décompression d'un ZIP) — au
   * lieu d'un aller-retour réseau complet par fichier (et donc un commit
   * séparé par fichier), tout est envoyé en une poignée de requêtes.
   */
  async function pushFiles(
    files: { path: string; content: string }[],
    message: string,
    onProgress?: (done: number, total: number) => void
  ): Promise<{ ok: boolean; error?: string; pushedCount?: number }> {
    if (!token || !selectedRepo) return { ok: false, error: "Non authentifié" };
    if (files.length === 0) return { ok: false, error: "Aucun fichier à pousser" };

    try {
      const refRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/ref/heads/${currentBranch}`);
      if (!refRes.ok) return { ok: false, error: await ghError(refRes, "Impossible de lire la branche") };
      const refData = (await refRes.json()) as { object: { sha: string } };
      const commitSha = refData.object.sha;

      const commitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits/${commitSha}`);
      if (!commitRes.ok) return { ok: false, error: await ghError(commitRes, "Impossible de lire le commit") };
      const commitData = (await commitRes.json()) as { tree: { sha: string } };
      const rootTreeSha = commitData.tree.sha;

      // Création de tous les blobs EN PARALLÈLE (c'est ça, le gros du gain
      // de vitesse : N requêtes concurrentes au lieu de N requêtes en série).
      let done = 0;
      const blobs = await Promise.all(
        files.map(async (f) => {
          const blobRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: f.content, encoding: "base64" }),
          });
          done++;
          onProgress?.(done, files.length);
          if (!blobRes.ok) throw new Error(await ghError(blobRes, `Blob "${f.path}"`));
          const blobData = (await blobRes.json()) as { sha: string };
          return { path: f.path, sha: blobData.sha };
        })
      );

      // Un seul arbre, basé sur l'arbre existant (base_tree), avec toutes
      // les entrées ajoutées/modifiées d'un coup.
      const newTreeRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          base_tree: rootTreeSha,
          tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
        }),
      });
      if (!newTreeRes.ok) return { ok: false, error: await ghError(newTreeRes, "Échec de la création de l'arbre") };
      const newTreeData = (await newTreeRes.json()) as { sha: string };

      // Un seul commit pour tous les fichiers.
      const newCommitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: newTreeData.sha, parents: [commitSha] }),
      });
      if (!newCommitRes.ok) return { ok: false, error: await ghError(newCommitRes, "Échec de la création du commit") };
      const newCommitData = (await newCommitRes.json()) as { sha: string };

      // Une seule mise à jour de la branche.
      const updateRefRes = await ghFetch(
        token,
        `/repos/${selectedRepo.full_name}/git/refs/heads/${currentBranch}`,
        { method: "PATCH", body: JSON.stringify({ sha: newCommitData.sha }) }
      );
      if (!updateRefRes.ok) return { ok: false, error: await ghError(updateRefRes, "Échec de la mise à jour de la branche") };

      void loadCommits(token, selectedRepo, currentBranch);
      return { ok: true, pushedCount: files.length };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function deleteDirectory(
    dirPath: string,
    message: string
  ): Promise<{ ok: boolean; error?: string; deletedCount?: number }> {
    if (!token || !selectedRepo) return { ok: false, error: "Non authentifié" };
    const cleanDir = dirPath.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!cleanDir) return { ok: false, error: "Chemin de répertoire invalide" };

    try {
      const refRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/ref/heads/${currentBranch}`);
      if (!refRes.ok) return { ok: false, error: await ghError(refRes, "Impossible de lire la branche") };
      const refData = (await refRes.json()) as { object: { sha: string } };
      const commitSha = refData.object.sha;

      const commitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits/${commitSha}`);
      if (!commitRes.ok) return { ok: false, error: await ghError(commitRes, "Impossible de lire le commit") };
      const commitData = (await commitRes.json()) as { tree: { sha: string } };
      const rootTreeSha = commitData.tree.sha;

      const treeRes = await ghFetch(
        token,
        `/repos/${selectedRepo.full_name}/git/trees/${rootTreeSha}?recursive=1`
      );
      if (!treeRes.ok) return { ok: false, error: await ghError(treeRes, "Impossible de lire l'arborescence") };
      const treeData = (await treeRes.json()) as {
        tree: { path: string; mode: string; type: string; sha: string }[];
        truncated?: boolean;
      };
      // Un arbre tronqué (dépôt volumineux, >100 000 entrées) ne contient pas
      // tous les fichiers : reconstruire l'arbre à partir de cette liste
      // incomplète supprimerait des fichiers par erreur. On refuse plutôt
      // que de risquer une perte de données silencieuse.
      if (treeData.truncated) {
        return { ok: false, error: "Dépôt trop volumineux pour cette opération (arborescence tronquée par GitHub)" };
      }

      const toRemove = (p: string) => p === cleanDir || p.startsWith(`${cleanDir}/`);
      const remaining = treeData.tree.filter((e) => e.type === "blob" && !toRemove(e.path));
      const removedCount = treeData.tree.filter((e) => e.type === "blob" && toRemove(e.path)).length;

      if (removedCount === 0) {
        return { ok: false, error: "Répertoire introuvable ou déjà vide" };
      }

      const newTreeRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
          tree: remaining.map((e) => ({ path: e.path, mode: e.mode, type: e.type, sha: e.sha })),
        }),
      });
      if (!newTreeRes.ok) return { ok: false, error: await ghError(newTreeRes, "Échec de la création du nouvel arbre") };
      const newTreeData = (await newTreeRes.json()) as { sha: string };

      const newCommitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: newTreeData.sha, parents: [commitSha] }),
      });
      if (!newCommitRes.ok) return { ok: false, error: await ghError(newCommitRes, "Échec de la création du commit") };
      const newCommitData = (await newCommitRes.json()) as { sha: string };

      const updateRefRes = await ghFetch(
        token,
        `/repos/${selectedRepo.full_name}/git/refs/heads/${currentBranch}`,
        { method: "PATCH", body: JSON.stringify({ sha: newCommitData.sha }) }
      );
      if (!updateRefRes.ok) return { ok: false, error: await ghError(updateRefRes, "Échec de la mise à jour de la branche") };

      void loadCommits(token, selectedRepo, currentBranch);
      return { ok: true, deletedCount: removedCount };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function clearRepo(
    message: string
  ): Promise<{ ok: boolean; error?: string; deletedCount?: number }> {
    if (!token || !selectedRepo) return { ok: false, error: "Non authentifié" };
    try {
      const refRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/ref/heads/${currentBranch}`);
      if (!refRes.ok) return { ok: false, error: await ghError(refRes, "Impossible de lire la branche") };
      const refData = (await refRes.json()) as { object: { sha: string } };
      const commitSha = refData.object.sha;

      const commitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits/${commitSha}`);
      if (!commitRes.ok) return { ok: false, error: await ghError(commitRes, "Impossible de lire le commit") };
      const commitData = (await commitRes.json()) as { tree: { sha: string } };
      const rootTreeSha = commitData.tree.sha;

      const treeRes = await ghFetch(
        token,
        `/repos/${selectedRepo.full_name}/git/trees/${rootTreeSha}?recursive=1`
      );
      if (!treeRes.ok) return { ok: false, error: await ghError(treeRes, "Impossible de lire l'arborescence") };
      const treeData = (await treeRes.json()) as { tree: { type: string }[]; truncated?: boolean };
      const blobCount = treeData.tree.filter((e) => e.type === "blob").length;

      if (blobCount === 0) return { ok: false, error: "Le dépôt est déjà vide" };

      const newTreeRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/trees`, {
        method: "POST",
        body: JSON.stringify({ tree: [] }),
      });
      if (!newTreeRes.ok) return { ok: false, error: await ghError(newTreeRes, "Échec de la création de l'arbre vide") };
      const newTreeData = (await newTreeRes.json()) as { sha: string };

      const newCommitRes = await ghFetch(token, `/repos/${selectedRepo.full_name}/git/commits`, {
        method: "POST",
        body: JSON.stringify({ message, tree: newTreeData.sha, parents: [commitSha] }),
      });
      if (!newCommitRes.ok) return { ok: false, error: await ghError(newCommitRes, "Échec de la création du commit") };
      const newCommitData = (await newCommitRes.json()) as { sha: string };

      const updateRefRes = await ghFetch(
        token,
        `/repos/${selectedRepo.full_name}/git/refs/heads/${currentBranch}`,
        { method: "PATCH", body: JSON.stringify({ sha: newCommitData.sha }) }
      );
      if (!updateRefRes.ok) return { ok: false, error: await ghError(updateRefRes, "Échec de la mise à jour de la branche") };

      void loadCommits(token, selectedRepo, currentBranch);
      return { ok: true, deletedCount: blobCount };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  return (
    <GitHubContext.Provider
      value={{
        token, user, repos, selectedRepo, branches, currentBranch,
        commits, loading, reposLoading,
        login, logout, selectRepo, selectBranch,
        fetchRepos, refreshCommits, pushFile, pushFiles, deleteDirectory, clearRepo,
      }}
    >
      {children}
    </GitHubContext.Provider>
  );
}

export function useGitHub() {
  const ctx = useContext(GitHubContext);
  if (!ctx) throw new Error("useGitHub must be inside GitHubProvider");
  return ctx;
}
