"use client";

import { useEffect, useMemo, useState } from "react";
import { CursorAnimatable } from "./cursor-animatable";

interface RepoDto {
  id: string;
  url: string;
  owner: string;
  name: string;
  status: "pending" | "indexing" | "ready" | "error";
  progress: number;
  errorMessage: string | null;
}

interface CitationDto {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName: string | null;
  excerpt: string;
}

interface AskResponseDto {
  answer: string;
  citations: CitationDto[];
  retrievedCitations?: CitationDto[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function HomePage() {
  const [url, setUrl] = useState("https://github.com/jaredhanson/passport");
  const [repoId, setRepoId] = useState<string | null>(null);
  const [repo, setRepo] = useState<RepoDto | null>(null);
  const [question, setQuestion] = useState("onde é feita a autenticação?");
  const [answer, setAnswer] = useState<AskResponseDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = repo?.status === "ready" && !busy;

  const statusBadge = useMemo(() => {
    if (!repo) return null;
    return <span className={`badge ${repo.status}`}>{repo.status}</span>;
  }, [repo]);

  useEffect(() => {
    if (!repoId) return;
    if (repo?.status === "ready" || repo?.status === "error") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/repos/${repoId}`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as RepoDto;
        setRepo(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [repoId, repo?.status]);

  async function onIndex() {
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch(`${API_URL}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? (await res.text()));
      }
      const created = (await res.json()) as { id: string };
      setRepoId(created.id);
      const detail = await fetch(`${API_URL}/repos/${created.id}`);
      setRepo((await detail.json()) as RepoDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAsk() {
    if (!repoId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/repos/${repoId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          Array.isArray(body?.message)
            ? body.message.join(", ")
            : (body?.message ?? (await res.text())),
        );
      }
      setAnswer((await res.json()) as AskResponseDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <CursorAnimatable />
      <main>
      <h1>RepoLens</h1>
      <p className="lead">
        Cole a URL de um repositório público do GitHub, indexe o código e
        pergunte onde as coisas acontecem — com citações de arquivo e linhas.
      </p>

      <section>
        <label htmlFor="url">URL do repositório</label>
        <div className="row">
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={busy}
          />
          <button type="button" onClick={onIndex} disabled={busy || !url.trim()}>
            Indexar
          </button>
        </div>
      </section>

      {repo && (
        <section className="status">
          <div className="status-line">
            <span>
              {repo.owner}/{repo.name}
            </span>
            {statusBadge}
          </div>
          <div className="bar" aria-label="progresso">
            <span style={{ width: `${repo.progress}%` }} />
          </div>
          <div className="status-line">
            <span>Progresso</span>
            <span>{repo.progress}%</span>
          </div>
          {repo.errorMessage && (
            <p className="error-text">{repo.errorMessage}</p>
          )}
        </section>
      )}

      <section>
        <label htmlFor="question">Pergunta</label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!canAsk && repo?.status !== "ready"}
        />
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={onAsk} disabled={!canAsk}>
            Perguntar
          </button>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      {answer && (
        <section>
          <label>Resposta</label>
          <div className="answer">{answer.answer}</div>
          <label style={{ marginTop: "1rem" }}>Trechos citados</label>
          {answer.citations.length === 0 ? (
            <p className="lead" style={{ marginTop: "0.5rem" }}>
              Nenhuma citação válida na resposta.
            </p>
          ) : (
            <ul className="citations">
              {answer.citations.map((c) => (
                <li key={`${c.filePath}:${c.startLine}-${c.endLine}`}>
                  <details>
                    <summary>
                      {c.filePath}:{c.startLine}-{c.endLine}
                      {c.symbolName ? ` (${c.symbolName})` : ""}
                    </summary>
                    <pre>{c.excerpt}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {(answer.retrievedCitations?.length ?? 0) > 0 && (
            <details style={{ marginTop: "1rem" }}>
              <summary>Contexto recuperado</summary>
              <ul className="citations">
                {answer.retrievedCitations!.map((c) => (
                  <li
                    key={`retrieved:${c.filePath}:${c.startLine}-${c.endLine}`}
                  >
                    <details>
                      <summary>
                        {c.filePath}:{c.startLine}-{c.endLine}
                        {c.symbolName ? ` (${c.symbolName})` : ""}
                      </summary>
                      <pre>{c.excerpt}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
      </main>
    </>
  );
}
