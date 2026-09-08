import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, SlidersHorizontal, Columns3, Download, ArrowUpDown, ArrowUp, ArrowDown,
  X, Pencil, ChevronLeft, ChevronRight, Rows3, Rows2, RefreshCw,
} from "lucide-react";
import { downloadCsv, stamp, type CsvCell } from "./exportCsv";

/* ------------------------------------------------------------------ */
/* 类型                                                                */
/* ------------------------------------------------------------------ */

export type CellType =
  | "text" | "enum" | "date" | "number" | "money" | "tags" | "longtext" | "boolean" | "link";

export interface ColumnOption {
  value: string;
  zh: string;
  en?: string;
}

export interface Column<T> {
  /** 字段名（编辑时回传） */
  key: string;
  /** 中文表头 */
  zh: string;
  /** 英文表头（双语展示） */
  en?: string;
  type?: CellType;
  width?: number | string;
  align?: "left" | "right";
  /** 取值函数 */
  value: (row: T) => unknown;
  /** 自定义渲染 */
  render?: (row: T, v: unknown) => React.ReactNode;
  /** 枚举选项（type=enum 时用于筛选与显示） */
  options?: ColumnOption[];
  /** 可编辑（配合 onCellEdit） */
  editable?: boolean;
  /** 可筛选 */
  filterable?: boolean;
  /** 参与全文搜索（默认 text/longtext/tags 参与） */
  searchable?: boolean;
  /** 默认隐藏 */
  hiddenByDefault?: boolean;
  /** 不可排序 */
  noSort?: boolean;
  /** 排序取值（默认取 value） */
  sortValue?: (row: T) => string | number | null;
  /** 导出取值（默认 value 字符串化） */
  exportValue?: (row: T) => CsvCell;
}

type FilterValue =
  | { kind: "enum"; values: string[] }
  | { kind: "text"; q: string }
  | { kind: "range"; min?: string; max?: string };

interface ColState { key: string; visible: boolean }

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  /** localStorage 记忆键（列显示/密度/页长） */
  storageKey: string;
  /** 导出文件名前缀 */
  exportName: string;
  emptyTitle?: string;
  emptyHint?: string;
  /** 行内编辑提交 */
  onCellEdit?: (row: T, key: string, value: unknown) => void | Promise<void>;
  /** 行点击（通常打开详情抽屉） */
  onRowClick?: (row: T) => void;
  /** 勾选列 + 批量操作 */
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
  /** 工具条右侧附加内容（如「新建」按钮） */
  toolbarExtra?: React.ReactNode;
  /** 刷新按钮 */
  onRefresh?: () => void;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSizeOptions?: number[];
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const nf = new Intl.NumberFormat("zh-CN");

function fmtMoney(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (Number.isNaN(n)) return String(v);
  return nf.format(Math.round(n));
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function cellText<T>(col: Column<T>, row: T): string {
  if (col.exportValue) return str(col.exportValue(row));
  const v = col.value(row);
  if (col.type === "enum") {
    const o = col.options?.find((x) => x.value === str(v));
    return o ? (o.en ? `${o.zh} (${o.en})` : o.zh) : str(v);
  }
  if (col.type === "money") return fmtMoney(v);
  if (col.type === "boolean") return v ? "是" : "否";
  return str(v);
}

function headerText<T>(col: Column<T>): string {
  return col.en ? `${col.zh} (${col.en})` : col.zh;
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  storageKey,
  exportName,
  emptyTitle = "暂无数据",
  emptyHint = "点击右上角新建，或先导入数据",
  onCellEdit,
  onRowClick,
  selectable,
  bulkActions,
  toolbarExtra,
  onRefresh,
  initialSort,
  pageSizeOptions = [25, 50, 100, 500],
}: DataTableProps<T>) {
  const data = React.useMemo(() => rows ?? [], [rows]);

  /* ---------- 持久化：列显示 / 密度 / 页长 ---------- */
  const [colState, setColState] = React.useState<ColState[]>(() => {
    const base = columns.map((c) => ({ key: c.key, visible: !c.hiddenByDefault }));
    try {
      const raw = localStorage.getItem(`wtc.table.${storageKey}`);
      if (raw) {
        const saved = JSON.parse(raw) as { cols?: ColState[]; density?: string; pageSize?: number };
        if (saved.cols) {
          const map = new Map(saved.cols.map((c) => [c.key, c.visible]));
          const merged = columns.map((c) => ({ key: c.key, visible: map.get(c.key) ?? !c.hiddenByDefault }));
          const extra = saved.cols.filter((c) => !columns.some((x) => x.key === c.key));
          return [...merged, ...extra];
        }
      }
    } catch { /* ignore */ }
    return base;
  });
  const [density, setDensity] = React.useState<"comfortable" | "compact">("comfortable");
  const [pageSize, setPageSize] = React.useState(50);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(`wtc.table.${storageKey}`);
      if (raw) {
        const saved = JSON.parse(raw) as { density?: "comfortable" | "compact"; pageSize?: number };
        if (saved.density) setDensity(saved.density);
        if (saved.pageSize) setPageSize(saved.pageSize);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(`wtc.table.${storageKey}`, JSON.stringify({ cols: colState, density, pageSize }));
    } catch { /* ignore */ }
  }, [storageKey, colState, density, pageSize]);

  const orderedCols = React.useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    return colState
      .map((s) => ({ col: byKey.get(s.key), visible: s.visible }))
      .filter((x): x is { col: Column<T>; visible: boolean } => !!x.col);
  }, [columns, colState]);
  const visibleCols = orderedCols.filter((c) => c.visible).map((c) => c.col);

  /* ---------- 搜索 / 筛选 / 排序 ---------- */
  const [q, setQ] = React.useState("");
  const [filters, setFilters] = React.useState<Record<string, FilterValue>>({});
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(initialSort ?? null);

  const searchable = columns.filter((c) => c.searchable ?? ["text", "longtext", "tags", "link"].includes(c.type ?? "text"));
  const filterable = columns.filter((c) => c.filterable);

  const filtered = React.useMemo(() => {
    let out = data;
    const kw = q.trim().toLowerCase();
    if (kw) {
      out = out.filter((r) =>
        searchable.some((c) => str(c.value(r)).toLowerCase().includes(kw)),
      );
    }
    for (const [key, f] of Object.entries(filters)) {
      const col = columns.find((c) => c.key === key);
      if (!col) continue;
      if (f.kind === "enum" && f.values.length) {
        out = out.filter((r) => f.values.includes(str(col.value(r))));
      } else if (f.kind === "text" && f.q.trim()) {
        const needle = f.q.trim().toLowerCase();
        out = out.filter((r) => str(col.value(r)).toLowerCase().includes(needle));
      } else if (f.kind === "range") {
        out = out.filter((r) => {
          const raw = col.value(r);
          const s = str(raw);
          if (!s) return false;
          if (f.min && s < f.min) return false;
          if (f.max && s > f.max) return false;
          return true;
        });
      }
    }
    return out;
  }, [data, q, filters, columns, searchable]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const get = col.sortValue ?? ((r: T) => {
      const v = col.value(r);
      if (typeof v === "number") return v;
      return str(v);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === null || va === undefined || va === "") return 1;
      if (vb === null || vb === undefined || vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "zh-CN") * dir;
    });
  }, [filtered, sort, columns]);

  /* ---------- 分页 / 选择 ---------- */
  const [page, setPage] = React.useState(1);
  React.useEffect(() => { setPage(1); }, [q, filters, pageSize]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const paged = React.useMemo(
    () => sorted.slice((curPage - 1) * pageSize, curPage * pageSize),
    [sorted, curPage, pageSize],
  );

  const [selected, setSelected] = React.useState<Set<string | number>>(new Set());
  const clearSel = () => setSelected(new Set());
  React.useEffect(() => { setSelected(new Set()); }, [q, filters]);
  const selRows = React.useMemo(
    () => sorted.filter((r) => selected.has(rowKey(r))),
    [sorted, selected, rowKey],
  );

  /* ---------- 行内编辑 ---------- */
  const [editing, setEditing] = React.useState<{ key: string | number; col: string } | null>(null);
  const [draft, setDraft] = React.useState<string>("");

  const startEdit = (row: T, col: Column<T>) => {
    if (!onCellEdit || !col.editable) return;
    setEditing({ key: rowKey(row), col: col.key });
    setDraft(str(col.value(row)));
  };
  const commit = async (row: T, col: Column<T>, next?: string) => {
    if (!onCellEdit) return;
    const before = str(col.value(row));
    const value = next !== undefined ? next : draft;
    setEditing(null);
    if (value === before) return;
    try {
      await onCellEdit(row, col.key, value === "" ? null : value);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`保存失败：${msg}`);
    }
  };

  /* ---------- 导出 ---------- */
  const exportRows = (list: T[], suffix: string) => {
    const headers = visibleCols.map(headerText);
    const body = list.map((r) => visibleCols.map((c) => cellText(c, r)));
    downloadCsv(`${exportName}-${suffix}-${stamp()}.csv`, headers, body);
  };

  const rowPad = density === "compact" ? "py-1.5" : "py-3";
  const headPad = density === "compact" ? "h-9" : "h-11";

  const toggleSort = (key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  /* ---------- 渲染 ---------- */
  return (
    <div className="space-y-3">
      {/* 工具条 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-50" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索…"
            className="h-9 w-56 pl-8"
          />
        </div>

        {filterable.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                筛选
                {Object.keys(filters).length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                    {Object.keys(filters).length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3 p-3">
              {filterable.map((col) => (
                <div key={col.key} className="space-y-1.5">
                  <div className="text-xs font-medium opacity-70">{headerText(col)}</div>
                  {col.type === "enum" ? (
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-auto">
                      {(col.options ?? []).map((o) => {
                        const cur = filters[col.key];
                        const active = cur?.kind === "enum" && cur.values.includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() =>
                              setFilters((f) => {
                                const cur = f[col.key];
                                const values = cur?.kind === "enum" ? cur.values : [];
                                const next = active
                                  ? values.filter((v) => v !== o.value)
                                  : [...values, o.value];
                                const nf = { ...f };
                                if (next.length) nf[col.key] = { kind: "enum", values: next };
                                else delete nf[col.key];
                                return nf;
                              })
                            }
                            className={cn(
                              "rounded-md border px-2 py-1 text-xs transition",
                              active
                                ? "border-primary bg-primary/15 text-foreground"
                                : "border-border opacity-70 hover:opacity-100",
                            )}
                            title={o.en}
                          >
                            {o.zh}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        value={filters[col.key]?.kind === "text" ? (filters[col.key] as { q: string }).q : ""}
                        onChange={(e) =>
                          setFilters((f) => {
                            const nf = { ...f };
                            if (e.target.value) nf[col.key] = { kind: "text", q: e.target.value };
                            else delete nf[col.key];
                            return nf;
                          })
                        }
                        placeholder="包含…"
                        className="h-8"
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters({})}>
                清除全部筛选
              </Button>
            </PopoverContent>
          </Popover>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Columns3 className="h-3.5 w-3.5" />
              列
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-96 w-72 overflow-auto p-2">
            {orderedCols.map(({ col, visible }, idx) => (
              <div key={col.key} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50">
                <Checkbox
                  checked={visible}
                  onCheckedChange={(v) =>
                    setColState((cs) => cs.map((c) => (c.key === col.key ? { ...c, visible: !!v } : c)))
                  }
                />
                <span className="flex-1 truncate text-xs" title={col.en}>
                  {headerText(col)}
                </span>
                <button
                  type="button"
                  className="px-1 text-xs opacity-50 hover:opacity-100 disabled:opacity-20"
                  disabled={idx === 0}
                  onClick={() =>
                    setColState((cs) => {
                      const n = [...cs];
                      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
                      return n;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="px-1 text-xs opacity-50 hover:opacity-100 disabled:opacity-20"
                  disabled={idx === orderedCols.length - 1}
                  onClick={() =>
                    setColState((cs) => {
                      const n = [...cs];
                      [n[idx + 1], n[idx]] = [n[idx], n[idx + 1]];
                      return n;
                    })
                  }
                >
                  ↓
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => setColState(columns.map((c) => ({ key: c.key, visible: !c.hiddenByDefault })))}
            >
              恢复默认列
            </Button>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setDensity((d) => (d === "compact" ? "comfortable" : "compact"))}
          title={density === "compact" ? "切换为舒适行高" : "切换为紧凑行高"}
        >
          {density === "compact" ? <Rows2 className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Download className="h-3.5 w-3.5" />
              下载
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel className="text-xs">导出为 CSV（Excel 可直接打开）</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => exportRows(sorted, "当前视图")}>
              当前筛选结果（{sorted.length} 行）
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportRows(data, "全部")}>
              全部数据（{data.length} 行）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {onRefresh && (
          <Button variant="outline" size="sm" className="h-9" onClick={onRefresh} title="刷新">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs opacity-70">
          <span>
            显示 {sorted.length === 0 ? 0 : (curPage - 1) * pageSize + 1}–
            {Math.min(curPage * pageSize, sorted.length)} / 共 {sorted.length} 条
            {sorted.length !== data.length && `（全库 ${data.length}）`}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[92px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n} 行/页
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {toolbarExtra}
        </div>
      </div>

      {/* 已选筛选 chips */}
      {Object.keys(filters).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(filters).map(([key, f]) => {
            const col = columns.find((c) => c.key === key);
            if (!col) return null;
            const label =
              f.kind === "enum"
                ? f.values.map((v) => col.options?.find((o) => o.value === v)?.zh ?? v).join(" / ")
                : f.kind === "text"
                  ? `含「${f.q}」`
                  : `${f.min ?? ""}~${f.max ?? ""}`;
            return (
              <Badge key={key} variant="secondary" className="gap-1 py-1 text-[11px]">
                {col.zh}: {label}
                <button
                  type="button"
                  onClick={() =>
                    setFilters((prev) => {
                      const n = { ...prev };
                      delete n[key];
                      return n;
                    })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setFilters({})}>
            清除
          </Button>
        </div>
      )}

      {/* 批量操作条 */}
      {selectable && selRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <span className="text-xs">已选 {selRows.length} 条</span>
          {bulkActions?.(selRows, clearSel)}
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={clearSel}>
            取消选择
          </Button>
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur">
            <TableRow>
              {selectable && (
                <TableHead className={cn("w-9", headPad)}>
                  <Checkbox
                    checked={paged.length > 0 && paged.every((r) => selected.has(rowKey(r)))}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (v) paged.forEach((r) => n.add(rowKey(r)));
                        else paged.forEach((r) => n.delete(rowKey(r)));
                        return n;
                      })
                    }
                  />
                </TableHead>
              )}
              {visibleCols.map((col) => {
                const active = sort?.key === col.key;
                return (
                  <TableHead
                    key={col.key}
                    className={cn(headPad, "whitespace-nowrap text-xs", col.align === "right" && "text-right")}
                    style={{ width: col.width }}
                    title={col.en}
                  >
                    {col.noSort ? (
                      <span>{col.zh}</span>
                    ) : (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:opacity-80"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.zh}
                        {active ? (
                          sort?.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </button>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  {selectable && <TableCell className={rowPad} />}
                  {visibleCols.map((c) => (
                    <TableCell key={c.key} className={rowPad}>
                      <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleCols.length + (selectable ? 1 : 0)} className="py-14 text-center">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{data.length === 0 ? emptyTitle : "没有匹配的记录"}</div>
                    <div className="text-xs opacity-60">
                      {data.length === 0 ? emptyHint : "试试放宽筛选条件"}
                    </div>
                    {data.length > 0 && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => { setQ(""); setFilters({}); }}>
                        清除搜索与筛选
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              paged.map((row) => {
                const rk = rowKey(row);
                return (
                  <TableRow
                    key={rk}
                    className={cn(onRowClick && "cursor-pointer hover:bg-muted/40")}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <TableCell className={rowPad} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(rk)}
                          onCheckedChange={(v) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (v) n.add(rk);
                              else n.delete(rk);
                              return n;
                            })
                          }
                        />
                      </TableCell>
                    )}
                    {visibleCols.map((col) => {
                      const v = col.value(row);
                      const isEditing = editing && editing.key === rk && editing.col === col.key;
                      return (
                        <TableCell
                          key={col.key}
                          className={cn(rowPad, "align-middle text-sm", col.align === "right" && "text-right")}
                          onClick={(e) => {
                            if (isEditing) e.stopPropagation();
                          }}
                        >
                          {isEditing ? (
                            col.type === "enum" && col.options ? (
                              <Select
                                value={draft}
                                onValueChange={(val) => { setDraft(val); void commit(row, col, val); }}
                              >
                                <SelectTrigger className="h-7 w-full text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {col.options.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">
                                      {o.en ? `${o.zh} (${o.en})` : o.zh}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : col.type === "longtext" ? (
                              <Textarea
                                autoFocus
                                rows={3}
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => void commit(row, col)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="min-h-[60px] text-xs"
                              />
                            ) : (
                              <Input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={() => void commit(row, col)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void commit(row, col);
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="h-7 text-xs"
                              />
                            )
                          ) : (
                            <div className="group/cell flex items-center gap-1.5">
                              <div className="min-w-0 flex-1">
                                {col.render ? col.render(row, v) : <DefaultCell col={col} v={v} />}
                              </div>
                              {onCellEdit && col.editable && (
                                <button
                                  type="button"
                                  className="opacity-0 transition group-hover/cell:opacity-50 hover:!opacity-100"
                                  onClick={(e) => { e.stopPropagation(); startEdit(row, col); }}
                                  title="编辑"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" className="h-8" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="opacity-70">
            第 {curPage} / {pageCount} 页
          </span>
          <Button variant="outline" size="sm" className="h-8" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

function DefaultCell<T>({ col, v }: { col: Column<T>; v: unknown }) {
  if (v === null || v === undefined || v === "") return <span className="opacity-30">—</span>;
  switch (col.type) {
    case "enum": {
      const o = col.options?.find((x) => x.value === str(v));
      return (
        <Badge variant="outline" className="font-normal" title={o?.en}>
          {o?.zh ?? str(v)}
        </Badge>
      );
    }
    case "tags": {
      const parts = str(v).split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <div className="flex flex-wrap gap-1">
          {parts.slice(0, 3).map((t) => (
            <Badge key={t} variant="secondary" className="font-normal">
              {t}
            </Badge>
          ))}
          {parts.length > 3 && <span className="text-xs opacity-50">+{parts.length - 3}</span>}
        </div>
      );
    }
    case "money":
      return <span className="tabular-nums">{fmtMoney(v)}</span>;
    case "number":
      return <span className="tabular-nums">{str(v)}</span>;
    case "boolean":
      return <Badge variant={v ? "default" : "outline"}>{v ? "是" : "否"}</Badge>;
    case "link": {
      const s = str(v);
      return (
        <a
          href={s.startsWith("http") ? s : `https://${s}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 opacity-80 hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {s.replace(/^https?:\/\//, "").slice(0, 32)}
        </a>
      );
    }
    case "longtext":
      return (
        <span className="line-clamp-1 max-w-[280px]" title={str(v)}>
          {str(v)}
        </span>
      );
    default:
      return <span className="truncate">{str(v)}</span>;
  }
}
