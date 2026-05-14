"use client";

import * as React from "react";

import { Board } from "@/components/boggle/Board";
import { List } from "@/components/boggle/List";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  AlgorithmOption,
  AlgorithmType,
  ComparisonResult,
  WordPathNode,
  WordResult,
} from "@/lib/types";

type SolverMode = "global" | "target";

const ALGORITHM_OPTIONS: AlgorithmOption[] = [
  {
    value: "trie_dfs",
    label: "Trie + DFS",
    description:
      "Prefix-tree pruning eliminates entire branches early. Best for large boards.",
  },
  {
    value: "hashmap_dfs",
    label: "HashMap + DFS",
    description:
      "Hash-set word lookup with max-length pruning. Simpler data structure, no prefix optimization.",
  },
  {
    value: "brute_dfs",
    label: "Brute Force + DFS",
    description:
      "Explores all paths up to max word length, then checks dictionary. No prefix pruning.",
  },
  {
    value: "compare_all",
    label: "Compare All",
    description:
      "Runs all three algorithms side-by-side and shows a speed comparison table.",
  },
];

const sizeOptions = [
  { label: "3x3 (Mini)", value: 3 },
  { label: "4x4 (Classic)", value: 4 },
  { label: "5x5 (Big Boggle)", value: 5 },
  { label: "6x6 (Super Big)", value: 6 },
  { label: "7x7", value: 7 },
  { label: "8x8", value: 8 },
];

const createEmptyBoard = (size: number) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => ""));

const resizeBoard = (board: string[][], size: number) => {
  const nextBoard = createEmptyBoard(size);
  const copySize = Math.min(board.length, size);

  for (let row = 0; row < copySize; row += 1) {
    for (let col = 0; col < copySize; col += 1) {
      nextBoard[row][col] = board[row][col];
    }
  }

  return nextBoard;
};

const randomLetter = () =>
  String.fromCharCode(65 + Math.floor(Math.random() * 26));

const createRandomBoard = (size: number) =>
  Array.from({ length: size }, () =>
    Array.from({ length: size }, () => randomLetter())
  );

const buildHighlightSet = (path?: WordPathNode[]) => {
  const result = new Set<string>();
  if (!path) {
    return result;
  }

  path.forEach((node) => {
    result.add(`${node.row}-${node.col}`);
  });

  return result;
};

const scoreWord = (word: string) => Math.max(1, word.length - 2);

const normalizePath = (path: unknown): WordPathNode[] | undefined => {
  if (!Array.isArray(path)) {
    return undefined;
  }

  const nodes = path
    .map((node) => {
      if (Array.isArray(node) && node.length >= 2) {
        return { row: Number(node[0]), col: Number(node[1]) };
      }

      if (node && typeof node === "object") {
        const record = node as Record<string, unknown>;
        const row =
          typeof record.row === "number"
            ? record.row
            : typeof record.r === "number"
              ? record.r
              : typeof record.row === "string"
                ? Number(record.row)
                : typeof record.r === "string"
                  ? Number(record.r)
                  : NaN;
        const col =
          typeof record.col === "number"
            ? record.col
            : typeof record.c === "number"
              ? record.c
              : typeof record.col === "string"
                ? Number(record.col)
                : typeof record.c === "string"
                  ? Number(record.c)
                  : NaN;

        if (Number.isFinite(row) && Number.isFinite(col)) {
          return { row, col };
        }
      }

      return null;
    })
    .filter(
      (node): node is WordPathNode =>
        !!node && Number.isFinite(node.row) && Number.isFinite(node.col)
    );

  return nodes.length ? nodes : undefined;
};

const normalizeResults = (data: unknown): WordResult[] => {
  if (!data) {
    return [];
  }

  const rawArray = Array.isArray(data)
    ? data
    : Array.isArray((data as { words?: unknown }).words)
      ? (data as { words: unknown[] }).words
      : Array.isArray((data as { results?: unknown }).results)
        ? (data as { results: unknown[] }).results
        : [];

  const results = rawArray
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as {
        word?: string;
        text?: string;
        points?: number;
        score?: number;
        length?: number;
        path?: unknown;
        cells?: unknown;
        coords?: unknown;
      };

      const word = (record.word ?? record.text ?? "").toUpperCase();
      if (!word) {
        return null;
      }

      return {
        word,
        points: Number(record.points ?? record.score ?? scoreWord(word)),
        path: normalizePath(record.path ?? record.cells ?? record.coords),
      };
    })
    .filter((item): item is WordResult => !!item);

  const unique = new Map<string, WordResult>();
  results.forEach((item) => {
    if (!unique.has(item.word)) {
      unique.set(item.word, item);
    }
  });

  return Array.from(unique.values());
};

const buildFallbackResults = (board: string[][], minLength: number) => {
  const results: WordResult[] = [];

  board.forEach((row, rowIndex) => {
    const letters = row
      .map((letter, colIndex) => ({ letter, colIndex }))
      .filter(({ letter }) => letter);

    if (letters.length >= minLength) {
      const word = letters.map(({ letter }) => letter).join("");
      results.push({
        word,
        points: scoreWord(word),
        path: letters.map(({ colIndex }) => ({ row: rowIndex, col: colIndex })),
      });
    }
  });

  const size = board.length;
  for (let col = 0; col < size; col += 1) {
    const letters = board
      .map((row, rowIndex) => ({ letter: row[col], rowIndex }))
      .filter(({ letter }) => letter);

    if (letters.length >= minLength) {
      const word = letters.map(({ letter }) => letter).join("");
      results.push({
        word,
        points: scoreWord(word),
        path: letters.map(({ rowIndex }) => ({ row: rowIndex, col })),
      });
    }
  }

  const unique = new Map<string, WordResult>();
  results.forEach((item) => {
    if (!unique.has(item.word)) {
      unique.set(item.word, item);
    }
  });

  return Array.from(unique.values());
};

export default function Home() {
  const [mode, setMode] = React.useState<SolverMode>("global");
  const [algorithm, setAlgorithm] = React.useState<AlgorithmType>("trie_dfs");
  const [boardSize, setBoardSize] = React.useState(4);
  const [board, setBoard] = React.useState(() => createEmptyBoard(4));
  const [minLength, setMinLength] = React.useState(3);
  const [targetWord, setTargetWord] = React.useState("");
  const [results, setResults] = React.useState<WordResult[]>([]);
  const [activeWord, setActiveWord] = React.useState<string | null>(null);
  const [hoveredWord, setHoveredWord] = React.useState<WordResult | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [isSolving, setIsSolving] = React.useState(false);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [executionTime, setExecutionTime] = React.useState<number | null>(null);
  const [usedAlgorithm, setUsedAlgorithm] = React.useState<string | null>(null);
  const [comparison, setComparison] = React.useState<ComparisonResult[] | null>(null);
  const [targetInputError, setTargetInputError] = React.useState<string | null>(
    null
  );
  const [invalidCells, setInvalidCells] = React.useState<Set<string>>(
    () => new Set()
  );
  const [timeoutModalOpen, setTimeoutModalOpen] = React.useState(false);
  const [timeoutAlgo, setTimeoutAlgo] = React.useState<string | null>(null);

  React.useEffect(() => {
    const storedTheme = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const initialTheme =
      storedTheme === "dark" || (!storedTheme && prefersDark)
        ? "dark"
        : "light";
    setTheme(initialTheme);
    document.documentElement.classList.toggle("dark", initialTheme === "dark");
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  const selectedResult = React.useMemo(
    () => results.find((item) => item.word === activeWord) ?? null,
    [activeWord, results]
  );

  const highlightedCells = React.useMemo(
    () => buildHighlightSet(hoveredWord?.path ?? selectedResult?.path),
    [hoveredWord, selectedResult]
  );

  React.useEffect(() => {
    if (activeWord && !results.some((item) => item.word === activeWord)) {
      setActiveWord(null);
    }
  }, [activeWord, results]);

  React.useEffect(() => {
    if (mode !== "target") {
      setTargetInputError(null);
    }
  }, [mode]);

  const handleBoardChange = (row: number, col: number, value: string) => {
    setBoard((prev) => {
      const next = prev.map((rowCells) => [...rowCells]);
      next[row][col] = value;
      return next;
    });
    setHoveredWord(null);
  };

  const handleInvalidInput = (
    row: number,
    col: number,
    isInvalid: boolean
  ) => {
    const key = `${row}-${col}`;
    setInvalidCells((prev) => {
      const next = new Set(prev);
      if (isInvalid) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleClearBoard = () => {
    setBoard(createEmptyBoard(boardSize));
    setResults([]);
    setActiveWord(null);
    setHoveredWord(null);
    setInvalidCells(new Set());
    setExecutionTime(null);
    setUsedAlgorithm(null);
    setComparison(null);
  };

  const handleRandomFill = () => {
    setBoard(createRandomBoard(boardSize));
    setResults([]);
    setActiveWord(null);
    setHoveredWord(null);
    setInvalidCells(new Set());
    setExecutionTime(null);
    setUsedAlgorithm(null);
    setComparison(null);
  };

  const handleSizeChange = (value: number) => {
    setBoardSize(value);
    setBoard((prev) => resizeBoard(prev, value));
    setResults([]);
    setActiveWord(null);
    setHoveredWord(null);
    setInvalidCells(new Set());
    setExecutionTime(null);
    setUsedAlgorithm(null);
    setComparison(null);
  };

  const handleSolve = async () => {
    setIsSolving(true);
    setHoveredWord(null);
    setActiveWord(null);
    setExecutionTime(null);
    setUsedAlgorithm(null);
    setComparison(null);
    setTimeoutModalOpen(false);
    setTimeoutAlgo(null);

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const isSlowAlgorithm =
      algorithm === "hashmap_dfs" || algorithm === "brute_dfs";
    const TIMEOUT_MS = isSlowAlgorithm ? 8000 : 30000;

    timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);

    try {
      const payload: Record<string, unknown> = {
        board,
        mode,
        algorithm,
      };

      if (mode === "global") {
        payload.min_length = minLength;
      }

      if (mode === "target") {
        payload.target = targetWord.trim().toUpperCase();
      }

      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error("Solver response not available");
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Comparison mode
      if (
        algorithm === "compare_all" &&
        mode === "global" &&
        Array.isArray(data.comparison)
      ) {
        const comp = (data.comparison as ComparisonResult[]).map((item) => ({
          ...item,
          execution_time_ms:
            typeof item.execution_time_ms === "number"
              ? item.execution_time_ms
              : Number(item.execution_time_ms),
          word_count:
            typeof item.word_count === "number"
              ? item.word_count
              : Number(item.word_count),
        }));

        setComparison(comp);

        // Use the first algorithm's results as default display
        const firstResults = data.comparison[0]?.results;
        setResults(normalizeResults(firstResults));
        setUsedAlgorithm("Compare All");
        return;
      }

      if (mode === "target") {
        const targetUpper = targetWord.trim().toUpperCase();
        const found = Boolean(data && typeof data === "object" && data.found);
        const path = normalizePath(
          data && typeof data === "object" ? data.path : undefined
        );

        setResults(
          found && targetUpper
            ? [
                {
                  word: targetUpper,
                  points: scoreWord(targetUpper),
                  path,
                },
              ]
            : []
        );
      } else {
        setResults(normalizeResults(data));
      }

      if (typeof data.execution_time_ms === "number") {
        setExecutionTime(data.execution_time_ms);
      } else if (data.meta && typeof (data.meta as Record<string, unknown>).execution_time_ms === "number") {
        setExecutionTime(
          (data.meta as Record<string, unknown>).execution_time_ms as number
        );
      }

      if (typeof data.algorithm === "string") {
        setUsedAlgorithm(data.algorithm);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        if (isSlowAlgorithm) {
          setTimeoutAlgo(
            algorithm === "hashmap_dfs" ? "HashMap + DFS" : "Brute Force + DFS"
          );
          setTimeoutModalOpen(true);
          setAlgorithm("trie_dfs");
          handleClearBoard();
          setIsSolving(false);
          if (timeoutId) clearTimeout(timeoutId);
          return;
        }
      }
      setResults(buildFallbackResults(board, minLength));
    } finally {
      setIsSolving(false);
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  const selectedAlgoOption = ALGORITHM_OPTIONS.find(
    (opt) => opt.value === algorithm
  );

  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-surface-variant bg-surface px-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold text-primary">Boggle Pro</span>
          <button className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high md:hidden">
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
            type="button"
            onClick={() => setHelpOpen(true)}
          >
            <span className="material-symbols-outlined">help_outline</span>
          </button>
          <button
            className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high"
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1360px] min-h-[calc(100vh-4rem)] grid-cols-1 gap-6 px-6 py-8 md:grid-cols-12">
        <aside className="md:col-span-3 flex flex-col gap-6 md:h-[calc(100vh-7rem)]">
          <Card className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <CardHeader>
              <CardTitle>Solver Mode</CardTitle>
            </CardHeader>
            <CardContent className="mt-0 space-y-6">
              <div className="flex rounded-lg bg-surface-container-low p-1">
                <button
                  className={`flex-1 rounded-md py-2 text-sm font-medium shadow-sm transition-colors ${
                    mode === "global"
                      ? "bg-surface-container-lowest text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  type="button"
                  onClick={() => setMode("global")}
                >
                  Global
                </button>
                <button
                  className={`flex-1 rounded-md py-2 text-sm font-medium shadow-sm transition-colors ${
                    mode === "target"
                      ? "bg-surface-container-lowest text-on-surface"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                  type="button"
                  onClick={() => setMode("target")}
                >
                  Target Word
                </button>
              </div>
              {mode === "target" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-on-surface-variant">
                    Target Word
                  </label>
                  <Input
                    placeholder="Type the word to find"
                    value={targetWord}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      const sanitized = rawValue.replace(/[^a-zA-Z]/g, "");
                      const normalized = sanitized.toUpperCase();
                      const truncated = normalized.slice(0, 8);
                      setTargetWord(truncated);

                      if (!rawValue) {
                        setTargetInputError(null);
                        return;
                      }

                      if (sanitized.length !== rawValue.length) {
                        setTargetInputError("Only letters A-Z are allowed.");
                        return;
                      }

                      if (normalized.length > 8) {
                        setTargetInputError("Maximum length is 8 letters.");
                        return;
                      }

                      if (truncated.length < 3) {
                        setTargetInputError("Minimum length is 3 letters.");
                        return;
                      }

                      setTargetInputError(null);
                    }}
                  />
                  {targetInputError && (
                    <p className="text-xs font-medium text-red-600">
                      {targetInputError}
                    </p>
                  )}
                  {!targetInputError && (
                    <p className="text-xs text-on-surface-variant">
                      Use 3-8 letters (A-Z).
                    </p>
                  )}
                </div>
              )}

              {/* Algorithm Selector */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface-variant">
                  Algorithm
                </label>
                <select
                  className="w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={algorithm}
                  onChange={(event) =>
                    setAlgorithm(event.target.value as AlgorithmType)
                  }
                >
                  {ALGORITHM_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {selectedAlgoOption && (
                  <p className="text-[11px] text-on-surface-variant leading-snug">
                    {selectedAlgoOption.description}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-on-surface-variant">
                  Grid Size
                </label>
                <select
                  className="w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-sm text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  value={boardSize}
                  onChange={(event) =>
                    handleSizeChange(Number(event.target.value))
                  }
                >
                  {sizeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {mode === "global" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-on-surface-variant">
                    Minimum Word Length
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      className="flex-1 accent-primary"
                      max={8}
                      min={3}
                      type="range"
                      value={minLength}
                      onChange={(event) =>
                        setMinLength(Number(event.target.value))
                      }
                    />
                    <span className="w-6 text-center text-sm font-medium text-on-surface">
                      {minLength}
                    </span>
                  </div>
                </div>
              )}
              <Button
                className="w-full"
                variant="default"
                disabled={
                  isSolving ||
                  (mode === "target" &&
                    (targetWord.trim().length < 3 ||
                      targetWord.trim().length > 8 ||
                      !!targetInputError))
                }
                onClick={handleSolve}
              >
                {isSolving ? (
                  <>
                    <span className="spinner" />
                    Solving...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">search</span>
                    Solve Board
                  </>
                )}
              </Button>

              {/* Execution Time Display */}
              {executionTime !== null && (
                <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-on-surface-variant">
                      Execution Time
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      {executionTime.toFixed(2)} ms
                    </span>
                  </div>
                  {usedAlgorithm && (
                    <p className="mt-1 text-[11px] text-on-surface-variant">
                      Algorithm: {usedAlgorithm}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card
            className="flex-1 animate-fade-up"
            style={{ animationDelay: "160ms" }}
          >
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="mt-0 space-y-2">
              <button
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-on-surface-variant hover:border-outline-variant hover:bg-surface-container-low"
                type="button"
                onClick={handleClearBoard}
              >
                <span className="material-symbols-outlined text-[18px]">clear_all</span>
                Clear Board
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-on-surface-variant hover:border-outline-variant hover:bg-surface-container-low"
                type="button"
                onClick={handleRandomFill}
              >
                <span className="material-symbols-outlined text-[18px]">shuffle</span>
                Random Fill
              </button>
            </CardContent>
          </Card>
        </aside>

        <section className="md:col-span-6 flex flex-col gap-6 md:h-[calc(100vh-7rem)]">
          <Card
            className="flex-1 animate-fade-up overflow-hidden"
            style={{ animationDelay: "240ms" }}
          >
            <CardContent className="mt-0 flex h-full flex-col items-center justify-center gap-6">
              {invalidCells.size > 0 && (
                <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Only letters A-Z are allowed. Please replace any invalid
                  characters.
                </div>
              )}
              <Board
                board={board}
                highlightedCells={highlightedCells}
                invalidCells={invalidCells}
                size={boardSize}
                onCellChange={handleBoardChange}
                onInvalidInput={handleInvalidInput}
              />
              <div className="text-center">
                <p className="text-sm text-on-surface-variant">
                  Select a word in the right panel to see its path.
                </p>
                {selectedResult ? (
                  <div className="mt-4 inline-flex items-center rounded-full border border-highlight-border/40 bg-highlight/40 px-4 py-2">
                    <span className="text-lg font-semibold tracking-wide text-primary">
                      {selectedResult.word}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-on-surface-variant">
                    No word selected
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Comparison Table */}
          {comparison && (
            <Card className="animate-fade-up">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Algorithm Comparison</CardTitle>
              </CardHeader>
              <CardContent className="mt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-outline-variant">
                        <th className="pb-2 text-left font-medium text-on-surface-variant">Algorithm</th>
                        <th className="pb-2 text-right font-medium text-on-surface-variant">Time (ms)</th>
                        <th className="pb-2 text-right font-medium text-on-surface-variant">Words Found</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((row) => {
                        const fastest = Math.min(...comparison.map((r) => r.execution_time_ms));
                        const isFastest = row.execution_time_ms === fastest;
                        return (
                          <tr key={row.algorithm} className="border-b border-outline-variant/50">
                            <td className="py-2 font-medium text-on-surface">
                              {row.algorithm}
                              {isFastest && (
                                <span className="ml-2 inline-flex rounded-full bg-highlight px-2 py-0.5 text-[10px] font-semibold text-primary">
                                  Fastest
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right font-mono text-on-surface">
                              {row.execution_time_ms.toFixed(2)}
                            </td>
                            <td className="py-2 text-right text-on-surface-variant">
                              {row.word_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <aside className="md:col-span-3 flex flex-col gap-6 md:h-[calc(100vh-7rem)]">
          <Card
            className="flex h-full min-h-0 flex-col animate-fade-up overflow-hidden"
            style={{ animationDelay: "320ms" }}
          >
            <CardContent className="mt-0 flex h-full min-h-0 flex-col">
              <List
                results={results}
                activeWord={activeWord}
                onSelectWord={(item) => {
                  setActiveWord(item.word);
                  setHoveredWord(null);
                }}
                onHoverWord={setHoveredWord}
              />
            </CardContent>
          </Card>
        </aside>
      </main>

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4">
          <Card className="w-full max-w-lg border border-outline-variant bg-surface shadow-ambient">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>About Boggle Pro Solver</CardTitle>
              <button
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container-low"
                type="button"
                onClick={() => setHelpOpen(false)}
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-on-surface-variant">
              <p>
                Boggle Pro is a high-performance solver built with Next.js and a
                Go engine. You can design custom boards, switch grid sizes, and
                solve in two modes: Global Discovery or Target Word.
              </p>
              <p>
                Choose from three search algorithms or use <strong>Compare All</strong> to
                run them side-by-side and compare execution speed.
              </p>
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                  Algorithms
                </p>
                <ul className="space-y-1 text-xs">
                  <li><strong>Trie + DFS:</strong> Prefix-tree pruning cuts entire branches early. Best for large boards.</li>
                  <li><strong>HashMap + DFS:</strong> Hash-set word lookup with max-length bound. Simpler structure, no prefix optimization.</li>
                  <li><strong>Brute Force + DFS:</strong> Explores all paths up to max word length, then checks against dictionary. No pruning at all.</li>
                  <li><strong>Compare All:</strong> Runs all three and shows a speed comparison table.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {timeoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-md border border-outline-variant bg-surface shadow-ambient">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Search Timeout</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-on-surface-variant">
              <p>
                The <strong>{timeoutAlgo}</strong> algorithm took too long to
                search this board and has been stopped to keep the app
                responsive.
              </p>
              <p>
                We automatically switched to <strong>Trie + DFS</strong> and
                cleared the board for you. Trie + DFS is much faster because
                it prunes dead branches early using a prefix tree.
              </p>
              <div className="flex justify-end">
                <Button
                  variant="default"
                  onClick={() => setTimeoutModalOpen(false)}
                >
                  OK
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}