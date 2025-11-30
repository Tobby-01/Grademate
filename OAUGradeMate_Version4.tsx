import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Menu, Trash2, Upload, Download, Trash, Check } from "lucide-react";

/**
 * OAUGradeMate - Updated
 *
 * Features added per request:
 * - Settings panel with privacy statement, manual calculation instructions, theme selector
 * - Theme color effects: golden, purple, or combined gradient
 * - "Remember data" toggle: if off -> sessionStorage (cleared on tab close), if on -> localStorage
 * - CSV export and import (simple format described below)
 * - Confirmation modal for clearing data and for new calculation
 * - Rename: uses "harmattan" as primary key (correct spelling), with migration support for old "hamattan" saved data
 * - Improved UX: delete per row, add course, automatic CGPA calculation on changes
 *
 * CSV format (header required):
 * semester,code,units,grade
 * e.g.
 * harmattan,CSC101,3,A
 * rain,MTH102,4,B
 *
 * Privacy note shown in Settings:
 * - Data never leaves the browser unless you export and share it.
 * - Developer or server does not have access to your entries.
 * - When "Remember data" is off, the data is stored in sessionStorage and removed when the tab is closed.
 */

type Course = { code: string; units: string; grade: string };
type SemestersShape = { harmattan: Course[]; rain: Course[] };

const STORAGE_KEY = "oau-grade-mate-v3";
const gradePoints: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <div className="text-sm text-gray-700 mb-4">{description}</div>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
            }}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function OAUGradeMate() {
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<"courses" | "settings">("courses");

  // Use correct spelling "harmattan" internally by default
  const [currentSemester, setCurrentSemester] = useState<"harmattan" | "rain">("harmattan");

  const [semesters, setSemesters] = useState<SemestersShape>({
    harmattan: [{ code: "", units: "", grade: "" }],
    rain: [{ code: "", units: "", grade: "" }],
  });

  const [rememberData, setRememberData] = useState(false);
  const [theme, setTheme] = useState<"golden" | "purple" | "both">("both");
  const [cgpa, setCgpa] = useState<string | null>(null);

  // Modal state
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showNewCalcConfirm, setShowNewCalcConfirm] = useState(false);

  // File input ref for CSV import
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Storage helpers & migration ---
  const readStored = (): any | null => {
    try {
      const localRaw = localStorage.getItem(STORAGE_KEY);
      const sessionRaw = sessionStorage.getItem(STORAGE_KEY);
      // Prefer local if present
      const raw = localRaw ?? sessionRaw;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const migrateAndLoad = () => {
    try {
      const parsed = readStored();
      if (!parsed) return;
      // Older versions might have used key "hamattan" (misspelling).
      // We accept both and normalize to 'harmattan'.
      let loadedSemesters: any = parsed.semesters ?? parsed;
      if (!loadedSemesters) return;

      // If storage used 'hamattan', migrate to 'harmattan'
      if ((loadedSemesters as any).hamattan && !(loadedSemesters as any).harmattan) {
        (loadedSemesters as any).harmattan = (loadedSemesters as any).hamattan;
        delete (loadedSemesters as any).hamattan;
      }

      // Accept both 'harmattan' or 'hamattan' as source and normalize
      const harm = Array.isArray(loadedSemesters.harmattan)
        ? loadedSemesters.harmattan
        : Array.isArray(loadedSemesters.hamattan)
        ? loadedSemesters.hamattan
        : [{ code: "", units: "", grade: "" }];

      const rain = Array.isArray(loadedSemesters.rain) ? loadedSemesters.rain : [{ code: "", units: "", grade: "" }];

      setSemesters({
        harmattan: harm.length ? harm : [{ code: "", units: "", grade: "" }],
        rain: rain.length ? rain : [{ code: "", units: "", grade: "" }],
      });

      if (typeof parsed.currentSemester === "string") {
        const cs = parsed.currentSemester.toLowerCase();
        setCurrentSemester(cs === "rain" ? "rain" : "harmattan");
      }
      if (typeof parsed.rememberData === "boolean") setRememberData(parsed.rememberData);
      if (parsed.theme) setTheme(parsed.theme);
      if (parsed.view) setView(parsed.view);
    } catch {
      // ignore
    }
  };

  const persist = () => {
    try {
      const payload = { semesters, currentSemester, rememberData, theme, view };
      const str = JSON.stringify(payload);
      if (rememberData) {
        localStorage.setItem(STORAGE_KEY, str);
        sessionStorage.removeItem(STORAGE_KEY);
      } else {
        sessionStorage.setItem(STORAGE_KEY, str);
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  // Load once on mount
  useEffect(() => {
    migrateAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist when key state changes
  useEffect(() => {
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesters, currentSemester, rememberData, theme, view]);

  // --- Course CRUD ---
  const courses = semesters[currentSemester];

  const updateCourse = (index: number, key: keyof Course, value: string) => {
    const updated = [...courses];
    updated[index] = { ...updated[index], [key]: value };
    setSemesters({ ...semesters, [currentSemester]: updated });
  };

  const addCourse = () => {
    setSemesters({ ...semesters, [currentSemester]: [...courses, { code: "", units: "", grade: "" }] });
  };

  const deleteCourse = (index: number) => {
    const updated = courses.filter((_, i) => i !== index);
    setSemesters({
      ...semesters,
      [currentSemester]: updated.length ? updated : [{ code: "", units: "", grade: "" }],
    });
  };

  const clearAllDataImmediate = () => {
    setSemesters({
      harmattan: [{ code: "", units: "", grade: "" }],
      rain: [{ code: "", units: "", grade: "" }],
    });
    setCgpa(null);
    setCurrentSemester("harmattan");
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setShowClearConfirm(false);
  };

  const newCalculationImmediate = () => {
    setSemesters({
      harmattan: [{ code: "", units: "", grade: "" }],
      rain: [{ code: "", units: "", grade: "" }],
    });
    setCgpa(null);
    setCurrentSemester("harmattan");
    setShowNewCalcConfirm(false);
  };

  // --- GPA calculations ---
  const computeSemesterGPA = (semesterCourses: Course[]) => {
    let qp = 0;
    let cu = 0;
    semesterCourses.forEach((c) => {
      if (!c.units || !c.grade) return;
      const unitsNum = Number(c.units);
      if (!Number.isFinite(unitsNum) || unitsNum <= 0) return;
      const units = Math.min(Math.max(Math.round(unitsNum), 1), 5); // integer clamp
      const gp = gradePoints[(c.grade || "").toUpperCase()] ?? 0;
      qp += units * gp;
      cu += units;
    });
    return { qp, cu, gpa: cu ? qp / cu : null };
  };

  const calculateGPA = () => {
    const h = computeSemesterGPA(semesters.harmattan);
    const r = computeSemesterGPA(semesters.rain);
    const totalQP = h.qp + r.qp;
    const totalCU = h.cu + r.cu;
    setCgpa(totalCU ? (totalQP / totalCU).toFixed(2) : null);
  };

  useEffect(() => {
    calculateGPA();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesters]);

  const harmattanResult = computeSemesterGPA(semesters.harmattan);
  const rainResult = computeSemesterGPA(semesters.rain);

  const formatGPAForDisplay = (gpaNum: number | null) => (gpaNum === null ? "N/A" : gpaNum.toFixed(2));

  // --- CSV Export / Import ---
  const exportCSV = () => {
    // header: semester,code,units,grade
    const rows: string[] = ["semester,code,units,grade"];
    const pushRows = (sem: "harmattan" | "rain") => {
      semesters[sem].forEach((c) => {
        // only export non-empty rows (at least units and grade)
        if (!c.code && !c.units && !c.grade) return;
        // sanitize commas by wrapping values in quotes (basic)
        const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
        rows.push([sem, esc(c.code || ""), esc(c.units || ""), esc(c.grade || "")].join(","));
      });
    };
    pushRows("harmattan");
    pushRows("rain");

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oau-grade-mate-export.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result ?? "");
        // basic CSV parsing: split lines, handle quoted values
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
        if (!lines.length) return;
        // header first
        const header = lines[0].toLowerCase();
        const expected = ["semester", "code", "units", "grade"];
        const headers = header.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
        const hasAll = expected.every((e) => headers.includes(e));
        if (!hasAll) {
          alert("CSV header missing required columns. Expected: semester,code,units,grade");
          return;
        }
        const semesterMap: SemestersShape = { harmattan: [], rain: [] };
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // simple split on commas not inside quotes
          const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
          if (!parts || parts.length < 4) continue;
          // remove surrounding quotes
          const raw = parts.map((p) => p.replace(/^"|"$/g, ""));
          const semRaw = raw[0].trim().toLowerCase();
          const sem = semRaw === "rain" ? "rain" : "harmattan"; // default to harmattan if unknown
          const code = raw[1].trim();
          const units = raw[2].trim();
          const grade = raw[3].trim().toUpperCase();
          semesterMap[sem].push({ code, units, grade });
        }
        // Ensure at least one row remains in each semester
        if (!semesterMap.harmattan.length) semesterMap.harmattan = [{ code: "", units: "", grade: "" }];
        if (!semesterMap.rain.length) semesterMap.rain = [{ code: "", units: "", grade: "" }];

        setSemesters(semesterMap);
        setView("courses");
        alert("CSV imported successfully. Review your data before exporting or saving.");
      } catch (e) {
        console.error(e);
        alert("Failed to import CSV. Ensure it follows the expected format.");
      }
    };
    reader.readAsText(file);
  };

  const onChooseCSVToImport = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleImportFile(f);
    // reset so same file can be re-selected later
    e.currentTarget.value = "";
  };

  // --- Theme classes for background and accents ---
  const rootBgClass =
    theme === "golden"
      ? "bg-gradient-to-b from-yellow-100 via-yellow-50 to-white"
      : theme === "purple"
      ? "bg-gradient-to-b from-purple-800 via-purple-600 to-purple-300"
      : "bg-gradient-to-br from-purple-600 via-yellow-300 to-yellow-100";

  const accentButtonClass =
    theme === "golden"
      ? "bg-yellow-400 hover:bg-yellow-500 text-black"
      : theme === "purple"
      ? "bg-purple-600 hover:bg-purple-700 text-white"
      : "bg-gradient-to-r from-yellow-400 to-purple-600 text-white";

  return (
    <div className={`min-h-screen flex flex-col sm:flex-row ${rootBgClass}`}>
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-64" : "w-14"} fixed sm:static h-full bg-white/95 backdrop-blur-sm transition-all p-4 z-20 flex flex-col`}
      >
        <Button variant="ghost" className="mb-4" onClick={() => setSidebarOpen((s) => !s)}>
          <Menu />
        </Button>

        {sidebarOpen ? (
          <ul className="space-y-4 text-lg font-medium">
            <li
              className={`cursor-pointer ${view === "courses" && currentSemester === "harmattan" ? "font-bold" : ""}`}
              onClick={() => {
                setView("courses");
                setCurrentSemester("harmattan");
              }}
            >
              Harmattan Semester
            </li>
            <li
              className={`cursor-pointer ${view === "courses" && currentSemester === "rain" ? "font-bold" : ""}`}
              onClick={() => {
                setView("courses");
                setCurrentSemester("rain");
              }}
            >
              Rain Semester
            </li>
            <li
              className={`cursor-pointer ${view === "settings" ? "font-bold" : ""}`}
              onClick={() => setView("settings")}
            >
              Settings
            </li>
          </ul>
        ) : (
          <div className="flex-1" />
        )}
      </div>

      {/* Main */}
      <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
        {/* Header / Logo */}
        <div className="flex justify-center items-center mb-6 relative">
          <div
            className="w-20 h-20 rounded-full opacity-95"
            style={{ background: "linear-gradient(135deg, rgba(255,223,93,0.98), rgba(120,86,255,0.95))" }}
          />
          <div
            className="w-20 h-20 rounded-full opacity-90 absolute left-1/2 -translate-x-1/2"
            style={{ background: "linear-gradient(45deg, rgba(120,86,255,0.95), rgba(255,223,93,0.9))" }}
          />
        </div>

        <Card className="mb-6 w-full max-w-4xl mx-auto">
          <CardContent className="p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold">Welcome to OAU GradeMate</h1>
            <p className="text-gray-600 mt-1">Your personalized CGPA workspace — private and device-only</p>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-4xl mx-auto">
          <Button onClick={() => setShowNewCalcConfirm(true)} className={`p-4 sm:p-6 text-lg rounded-xl w-full ${accentButtonClass}`}>
            New Calc
          </Button>
          <Button onClick={calculateGPA} className={`p-4 sm:p-6 text-lg rounded-xl w-full ${accentButtonClass}`}>
            Calculate CGPA
          </Button>
          <div className="flex gap-2">
            <Button onClick={exportCSV} className="flex-1 p-4 rounded-xl border border-gray-300 bg-white">
              <Download className="mr-2" /> Export CSV
            </Button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileChange} className="hidden" />
            <Button onClick={onChooseCSVToImport} className="flex-1 p-4 rounded-xl border border-gray-300 bg-white">
              <Upload className="mr-2" /> Import CSV
            </Button>
          </div>
        </div>

        {/* Panels */}
        {view === "courses" ? (
          <>
            {/* Courses Card */}
            <Card className="mb-6 w-full max-w-4xl mx-auto">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">
                  {currentSemester === "harmattan" ? "Harmattan Semester" : "Rain Semester"} Courses
                </h2>
                <div className="space-y-4">
                  {courses.map((course, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 items-center">
                      <Input placeholder="Course Code" value={course.code} onChange={(e) => updateCourse(index, "code", e.target.value)} />
                      <Input
                        placeholder="Units (1-5)"
                        type="number"
                        min={1}
                        max={5}
                        value={course.units}
                        onChange={(e) => updateCourse(index, "units", e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <Select value={course.grade} onValueChange={(value) => updateCourse(index, "grade", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Grade" />
                          </SelectTrigger>
                          <SelectContent>
                            {["", "A", "B", "C", "D", "E", "F"].map((g) =>
                              g ? (
                                <SelectItem key={g} value={g}>
                                  {g}
                                </SelectItem>
                              ) : null
                            )}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" onClick={() => deleteCourse(index)} aria-label="Delete course">
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addCourse}>
                    + Add Course
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results Card */}
            <Card className="w-full max-w-4xl mx-auto">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-xl sm:text-2xl font-semibold mb-4">Results</h2>
                <p>
                  Harmattan Semester GPA: <span className="font-bold">{formatGPAForDisplay(harmattanResult.gpa)}</span> — CU:{" "}
                  <span className="font-medium">{harmattanResult.cu}</span>, QP: <span className="font-medium">{harmattanResult.qp}</span>
                </p>
                <p>
                  Rain Semester GPA: <span className="font-bold">{formatGPAForDisplay(rainResult.gpa)}</span> — CU:{" "}
                  <span className="font-medium">{rainResult.cu}</span>, QP: <span className="font-medium">{rainResult.qp}</span>
                </p>
                <p>
                  CGPA: <span className="font-bold">{cgpa ?? "N/A"}</span>
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          // Settings & Help
          <Card className="mb-6 w-full max-w-4xl mx-auto">
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-semibold mb-4">Settings & Help</h2>

              {/* Privacy */}
              <div className="mb-4">
                <h3 className="font-semibold">Privacy & Storage</h3>
                <p className="text-gray-700 mt-1">
                  Your data is stored only on your device. It is never sent to a server by this app. If "Remember data" is
                  off, your data is stored in sessionStorage and will be removed when you close the browser tab. The
                  developer does not have access to this data unless you explicitly export and share it.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rememberData}
                      onChange={(e) => setRememberData(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span>Remember data across browser sessions (localStorage)</span>
                  </label>
                  <Button onClick={() => setShowClearConfirm(true)} className="ml-auto">
                    <Trash className="mr-2" /> Clear Stored Data
                  </Button>
                </div>
              </div>

              {/* Theme */}
              <div className="mb-4">
                <h3 className="font-semibold">Theme / Color Effects</h3>
                <p className="text-gray-700 mt-1">Choose a color effect. The combined option provides a golden ↔ purple gradient.</p>
                <div className="mt-3 flex items-center gap-3">
                  <label className={`px-3 py-2 rounded ${theme === "golden" ? "ring-2 ring-yellow-400" : "border"}`}>
                    <input type="radio" name="theme" className="mr-2" checked={theme === "golden"} onChange={() => setTheme("golden")} />
                    Golden Yellow
                  </label>
                  <label className={`px-3 py-2 rounded ${theme === "purple" ? "ring-2 ring-purple-400" : "border"}`}>
                    <input type="radio" name="theme" className="mr-2" checked={theme === "purple"} onChange={() => setTheme("purple")} />
                    Purple
                  </label>
                  <label className={`px-3 py-2 rounded ${theme === "both" ? "ring-2 ring-indigo-400" : "border"}`}>
                    <input type="radio" name="theme" className="mr-2" checked={theme === "both"} onChange={() => setTheme("both")} />
                    Golden + Purple Gradient
                  </label>
                </div>
              </div>

              {/* Manual Calculation */}
              <div className="mb-4">
                <h3 className="font-semibold">How to calculate manually (worked example)</h3>
                <p className="text-gray-700 mt-1">CGPA is a weighted average of grade points using course units as weights.</p>
                <div className="mt-3">
                  <strong>Steps</strong>
                  <ol className="list-decimal list-inside ml-4 mt-2 text-gray-700">
                    <li>Convert letter grades to grade points (A=5, B=4, C=3, D=2, E=1, F=0).</li>
                    <li>Multiply course units by grade points to get quality points (QP) per course.</li>
                    <li>Sum QP for all courses to get total QP.</li>
                    <li>Sum course units to get total credit units (CU).</li>
                    <li>GPA = total QP / total CU. CGPA across semesters = (sum QP across semesters) / (sum CU across semesters).</li>
                  </ol>
                </div>

                <div className="mt-3 p-3 bg-white/80 rounded border">
                  <strong>Worked example</strong>
                  <div className="mt-2 text-sm text-gray-700">
                    Courses:
                    <ul className="list-disc list-inside mt-2">
                      <li>CSC101 — 3 units — A (5)</li>
                      <li>MTH102 — 4 units — B (4)</li>
                      <li>PHY103 — 2 units — C (3)</li>
                    </ul>
                    Calculations:
                    <ul className="list-decimal list-inside mt-2">
                      <li>CSC101 QP = 3 × 5 = 15</li>
                      <li>MTH102 QP = 4 × 4 = 16</li>
                      <li>PHY103 QP = 2 × 3 = 6</li>
                    </ul>
                    Total QP = 15 + 16 + 6 = 37
                    <br />
                    Total CU = 3 + 4 + 2 = 9
                    <br />
                    GPA = 37 / 9 ≈ 4.11
                    <br />
                    If the other semester has QP = 20 and CU = 6 then CGPA = (37 + 20) / (9 + 6) = 57 / 15 = 3.80
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div>
                <h3 className="font-semibold">Tips & Notes</h3>
                <ul className="list-disc list-inside ml-4 mt-2 text-gray-700">
                  <li>Units are expected to be integers 1–5; the app clamps values into this range.</li>
                  <li>Rows missing units or grade are ignored in calculations.</li>
                  <li>Use CSV export to back up or share your data; import to restore or move between devices.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confirmation modals */}
        <ConfirmationModal
          open={showClearConfirm}
          title="Clear stored data?"
          description={
            <>
              This will remove all saved data from this browser (both session and local storage). This action cannot be
              undone. If you want a backup, export your data as CSV before clearing.
            </>
          }
          confirmLabel="Clear data"
          cancelLabel="Cancel"
          onConfirm={clearAllDataImmediate}
          onCancel={() => setShowClearConfirm(false)}
        />

        <ConfirmationModal
          open={showNewCalcConfirm}
          title="Start a new calculation?"
          description={
            <>
              Starting a new calculation will clear the current entries from the workspace. If you want to keep a copy,
              export as CSV first. Do you want to continue?
            </>
          }
          confirmLabel="Start new"
          cancelLabel="Cancel"
          onConfirm={newCalculationImmediate}
          onCancel={() => setShowNewCalcConfirm(false)}
        />
      </div>
    </div>
  );
}