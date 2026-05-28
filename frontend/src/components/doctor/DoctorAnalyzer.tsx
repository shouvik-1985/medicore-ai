import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/api";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import VirtualKeyboard from "@/components/shared/VirtualKeyboard";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Languages,
  Loader2,
  Paperclip,
  Pill,
  ShieldCheck,
  Stethoscope,
  TestTube,
  X,
} from "lucide-react";
import {
  formatAnalyzerUiText,
  getAnalyzerLanguage,
  getAnalyzerLanguageStorageKey,
  insertTextAtCursor,
  removeTextAtCursor,
  shouldShowVirtualKeyboard,
} from "@/lib/analyzerLanguage";

interface PossibleCondition {
  name: string;
  confidence?: number;
  severity?: string;
  display_name?: string;
  severity_display?: string;
}

interface SimilarCase {
  tests?: string[];
  meds?: string[];
  tests_display?: string[];
  meds_display?: string[];
  distance?: number;
}

interface AttachmentSummary {
  media_type: string;
  name: string;
  summary: string;
  media_label?: string;
}

interface AnalyzerResult {
  id?: number;
  urgency?: string;
  ai_source?: string;
  ml_prediction?: string;
  dl_prediction?: string;
  clinical_reasoning?: string;
  specialist_consultation?: string;
  recovery_timeline?: string;
  local_ml_condition_support?: string[];
  possible_conditions?: PossibleCondition[];
  recommended_tests?: string[];
  recommended_medications?: string[];
  recommended_tests_display?: string[];
  recommended_medications_display?: string[];
  similar_cases?: SimilarCase[];
  input_modalities?: string[];
  uploaded_files?: string[];
  input_summary?: string;
  attachment_summaries?: AttachmentSummary[];
  diagnosis_display?: string;
  severity_display?: string;
  urgency_display?: string;
  response_language?: string;
  response_language_label?: string;
  input_modalities_display?: string[];
  ui_copy?: Record<string, string>;
}

const ANALYZER_ACCEPT = "image/*,application/pdf,audio/*,video/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOCTOR_LANGUAGE_STORAGE_KEY = getAnalyzerLanguageStorageKey("doctor");

const getFileBadgeIcon = (file: File) => {
  const fileName = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return FileImage;
  if (
    file.type === "application/pdf" ||
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx")
  ) {
    return FileText;
  }
  if (file.type.startsWith("audio/")) return FileAudio;
  if (file.type.startsWith("video/")) return FileVideo;
  return Paperclip;
};

const getMedicalTone = (value?: string) => {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("high") || normalized.includes("severe")) {
    return {
      pill: "border-rose-200 bg-rose-50 text-rose-700",
      accent: "text-rose-700",
      bar: "from-rose-500 to-orange-500",
    };
  }

  if (normalized.includes("moderate") || normalized.includes("medium")) {
    return {
      pill: "border-amber-200 bg-amber-50 text-amber-700",
      accent: "text-amber-700",
      bar: "from-amber-500 to-orange-400",
    };
  }

  return {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700",
    accent: "text-emerald-700",
    bar: "from-emerald-500 to-cyan-500",
  };
};

const getConfidenceLabel = (confidence: number) => {
  if (confidence >= 80) return "High confidence";
  if (confidence >= 60) return "Moderate confidence";
  return "Needs validation";
};

const formatSimilarity = (distance?: number) =>
  Math.max(0, (1 - (distance ?? 1)) * 100).toFixed(1);

const getUrgencyNoteConfig = (value?: string) => {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("high") || normalized.includes("severe") || normalized.includes("urgent")) {
    return {
      key: "urgencyNoteHigh",
      fallback: "Treat as high-priority review and rule out instability or rapid deterioration early.",
    };
  }

  if (normalized.includes("moderate") || normalized.includes("medium")) {
    return {
      key: "urgencyNoteModerate",
      fallback: "Prioritize near-term workup, targeted testing, and close clinical follow-up.",
    };
  }

  return {
    key: "urgencyNoteLow",
    fallback: "Suitable for structured workup if the bedside exam and current vitals remain reassuring.",
  };
};

const getWorkupLabel = (testCount: number, medicationCount: number) => {
  const totalItems = testCount + medicationCount;

  if (totalItems >= 8) return "Comprehensive plan";
  if (totalItems >= 4) return "Moderate plan";
  return "Focused plan";
};

const firstSentence = (value?: string) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text;
};

const DoctorAnalyzer = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(DOCTOR_LANGUAGE_STORAGE_KEY) || "en";
  });
  const [symptoms, setSymptoms] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finalDiagnosis, setFinalDiagnosis] = useState("");
  const [finalTests, setFinalTests] = useState("");
  const [finalMedications, setFinalMedications] = useState("");
  const [showKeyboard, setShowKeyboard] = useState(() => shouldShowVirtualKeyboard(language));
  const [activeField, setActiveField] = useState<"symptoms" | "finalDiagnosis" | "finalTests" | "finalMedications">("symptoms");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const symptomsInputRef = useRef<HTMLTextAreaElement | null>(null);
  const finalDiagnosisRef = useRef<HTMLTextAreaElement | null>(null);
  const finalTestsRef = useRef<HTMLTextAreaElement | null>(null);
  const finalMedicationsRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    localStorage.setItem(DOCTOR_LANGUAGE_STORAGE_KEY, language);
    setShowKeyboard(shouldShowVirtualKeyboard(language));
  }, [language]);

  useEffect(() => {
    if (!result) {
      setFinalDiagnosis("");
      setFinalTests("");
      setFinalMedications("");
      return;
    }

    setFinalDiagnosis(
      result.diagnosis_display ||
        result.possible_conditions?.[0]?.display_name ||
        result.possible_conditions?.[0]?.name ||
        ""
    );
    setFinalTests((result.recommended_tests_display || result.recommended_tests || []).join("\n"));
    setFinalMedications((result.recommended_medications_display || result.recommended_medications || []).join("\n"));
  }, [result]);

  const linesToList = (value: string) =>
    value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setSelectedFiles((previous) => {
      const seen = new Set(previous.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...previous];

      for (const file of files) {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          next.push(file);
          seen.add(key);
        }
      }

      return next;
    });
    setResult(null);
    event.target.value = "";
  };

  const removeSelectedFile = (targetFile: File) => {
    setSelectedFiles((previous) =>
      previous.filter(
        (file) =>
          !(file.name === targetFile.name && file.size === targetFile.size && file.lastModified === targetFile.lastModified)
      )
    );
    setResult(null);
  };

  const handleAnalyze = async () => {
    if (!symptoms.trim() && !selectedFiles.length) {
      toast.error("Please enter case notes or upload a medical file");
      return;
    }

    setResult(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("symptoms", symptoms.trim());
    formData.append("response_language", language);
    selectedFiles.forEach((file) => formData.append("attachments", file));

    try {
      const res = await axios.post(
        `${API_URL}/api/diagnosis/analyze/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setResult(res.data);
    } catch (err) {
      console.error(err);
      setResult(null);
      const message =
        axios.isAxiosError(err)
          ? err.response?.data?.error || "Analysis failed"
          : "Analysis failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDiagnosis = async () => {
    if (!result?.id) {
      toast.error("Cannot confirm: diagnosis record was not saved yet.");
      return;
    }

    if (!finalDiagnosis.trim()) {
      toast.error("Please enter final diagnosis before confirming.");
      return;
    }

    setConfirming(true);
    try {
      await axios.post(
        `${API_URL}/api/records/confirm/${result.id}/`,
        {
          final_diagnosis: finalDiagnosis.trim(),
          final_tests: linesToList(finalTests),
          final_medications: linesToList(finalMedications),
          response_language: language,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      toast.success("Diagnosis confirmed & AI trained");
    } catch (error) {
      console.error(error);
      toast.error("Failed to confirm diagnosis");
    } finally {
      setConfirming(false);
    }
  };

  const primaryCondition = result?.possible_conditions?.[0];
  const primaryTone = getMedicalTone(result?.urgency || primaryCondition?.severity);
  const possibleConditions = result?.possible_conditions || [];
  const recommendedTests = result?.recommended_tests_display || result?.recommended_tests || [];
  const recommendedMedications = result?.recommended_medications_display || result?.recommended_medications || [];
  const secondaryCondition = possibleConditions[1];
  const leadConfidence = primaryCondition?.confidence ?? 0;
  const runnerUpConfidence = secondaryCondition?.confidence ?? 0;
  const confidenceGap = Math.max(0, leadConfidence - runnerUpConfidence);
  const differentialSummary = possibleConditions
    .slice(1, 3)
    .map((condition) => condition.display_name || condition.name)
    .join(", ");
  const diagnosticPriorities = recommendedTests.slice(0, 3);
  const therapeuticPriorities = recommendedMedications.slice(0, 3);
  const primaryConditionName = result?.diagnosis_display || primaryCondition?.display_name || primaryCondition?.name;
  const primarySeverityLabel = primaryCondition?.severity_display || primaryCondition?.severity;
  const urgencyLabel = result?.urgency_display || result?.urgency || primarySeverityLabel;
  const urgencyNote = getUrgencyNoteConfig(result?.urgency || primaryCondition?.severity);
  const selectedLanguage = getAnalyzerLanguage(language);
  const uiCopy = result?.ui_copy;
  const t = (key: string, fallback: string, values?: Record<string, string | number>) =>
    formatAnalyzerUiText(uiCopy, key, fallback, values);

  const activeTextArea =
    activeField === "symptoms"
      ? symptomsInputRef.current
      : activeField === "finalDiagnosis"
        ? finalDiagnosisRef.current
        : activeField === "finalTests"
          ? finalTestsRef.current
          : finalMedicationsRef.current;

  const activeValue =
    activeField === "symptoms"
      ? symptoms
      : activeField === "finalDiagnosis"
        ? finalDiagnosis
        : activeField === "finalTests"
          ? finalTests
          : finalMedications;

  const updateActiveFieldValue = (nextValue: string) => {
    if (activeField === "symptoms") {
      setSymptoms(nextValue);
      setResult(null);
      return;
    }

    if (activeField === "finalDiagnosis") {
      setFinalDiagnosis(nextValue);
      return;
    }

    if (activeField === "finalTests") {
      setFinalTests(nextValue);
      return;
    }

    setFinalMedications(nextValue);
  };

  const handleKeyboardInsert = (value: string) => {
    insertTextAtCursor(activeTextArea, activeValue, value, updateActiveFieldValue);
  };

  const handleKeyboardBackspace = () => {
    removeTextAtCursor(activeTextArea, activeValue, updateActiveFieldValue);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-[28px] border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-sky-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 shadow-sm">
                  <Brain className="h-3.5 w-3.5" />
                  Clinical AI Workflow
                </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Doctor Clinical Analyzer
                </h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-600">
                  Turn a free-text case summary into a medical-style differential with evidence,
                  workup suggestions, and a structured confirmation workspace.
                </p>
              </div>
              </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="w-full min-w-[240px] max-w-[280px] rounded-2xl border border-cyan-100 bg-white/90 p-3 shadow-sm">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                  <Languages className="h-3.5 w-3.5" />
                  Output Language
                </p>
                <Select
                  value={language}
                  onValueChange={(value) => {
                    setLanguage(value);
                    setResult(null);
                  }}
                >
                  <SelectTrigger className="border-cyan-200 bg-white text-slate-700">
                    <SelectValue placeholder="Choose language" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "en",
                      "hi",
                      "bn",
                      "mr",
                      "ta",
                      "te",
                      "gu",
                      "kn",
                      "ml",
                      "pa",
                      "ur",
                    ].map((code) => {
                      const option = getAnalyzerLanguage(code);
                      return (
                        <SelectItem key={option.code} value={option.code}>
                          {option.label} ({option.nativeLabel})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-[11px] text-slate-500">
                  Doctor guidance is translated, while medical terms, tests, and medications stay in English.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-100 bg-white px-3 py-1 text-xs text-slate-600">
                  Differential Ranking
                </span>
                <span className="rounded-full border border-cyan-100 bg-white px-3 py-1 text-xs text-slate-600">
                  Test Planning
                </span>
                <span className="rounded-full border border-cyan-100 bg-white px-3 py-1 text-xs text-slate-600">
                  Treatment Review
                </span>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ANALYZER_ACCEPT}
            multiple
            onChange={handleFileSelection}
            className="hidden"
          />

          {shouldShowVirtualKeyboard(language) ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-cyan-950">
                  {selectedLanguage.label} input support is enabled
                </p>
                <p className="text-xs text-cyan-700">
                  Use the on-screen keyboard if this device does not have a {selectedLanguage.label} layout.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => setShowKeyboard((value) => !value)}>
                {showKeyboard ? "Hide Keyboard" : "Show Keyboard"}
              </Button>
            </div>
          ) : null}

          {showKeyboard && shouldShowVirtualKeyboard(language) ? (
            <VirtualKeyboard
              languageCode={language}
              onInsert={handleKeyboardInsert}
              onBackspace={handleKeyboardBackspace}
              onSpace={() => handleKeyboardInsert(" ")}
              onNewLine={() => handleKeyboardInsert("\n")}
              onHide={() => setShowKeyboard(false)}
            />
          ) : null}

          <Textarea
            ref={symptomsInputRef}
            value={symptoms}
            onFocus={() => setActiveField("symptoms")}
            onChange={(e) => {
              setSymptoms(e.target.value);
              setResult(null);
            }}
            placeholder="Describe the patient timeline, symptom pattern, risk factors, travel, exposures, comorbidities, and red flags, or upload image/PDF/Word/audio/video evidence..."
            className="min-h-[148px] rounded-2xl border-cyan-100 bg-white/90 text-slate-700 shadow-sm focus-visible:ring-cyan-500"
          />

          <div className="rounded-2xl border border-dashed border-cyan-200 bg-white/85 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Add case evidence</p>
                <p className="text-xs text-slate-500">
                  Upload image, PDF, Word, audio, or video files to support the differential and workup recommendations.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-cyan-200 text-cyan-700 hover:bg-cyan-50"
              >
                <Paperclip className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedFiles.length ? (
                selectedFiles.map((file) => {
                  const FileIcon = getFileBadgeIcon(file);

                  return (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="inline-flex items-center gap-2 rounded-full border border-cyan-100 bg-cyan-50/80 px-3 py-2 text-xs text-cyan-950"
                    >
                      <FileIcon className="h-3.5 w-3.5" />
                      <span className="max-w-[200px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(file)}
                        className="text-cyan-600 transition hover:text-cyan-800"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-500">No files selected yet.</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Rich clinical context across text and uploads usually improves differential quality and follow-up recommendations.
            </p>
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-cyan-700 hover:bg-cyan-800 sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Case...
                </>
              ) : (
                <>
                  <Stethoscope className="mr-2 h-4 w-4" />
                  Analyze Case
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card className="overflow-hidden border-cyan-100 shadow-sm">
              <div className="bg-gradient-to-r from-cyan-700 via-sky-700 to-cyan-800 p-5 text-white sm:p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                  {t("primaryAssessment", "Primary Assessment")}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {primaryConditionName || t("assessmentReady", "Assessment ready for review")}
                </h3>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${primaryTone.pill}`}>
                    {urgencyLabel || t("underReview", "Under review")}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                    {`${primaryCondition?.confidence ?? 0}% ${t("confidenceSuffix", "confidence")}`}
                  </span>
                  {(result.input_modalities_display || result.input_modalities || []).map((modality) => (
                    <span
                      key={modality}
                      className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-white/90"
                    >
                      {modality}
                    </span>
                  ))}
                  {result.ai_source && (
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
                      {t("sourcePrefix", "Source")}: {String(result.ai_source).toUpperCase()}
                    </span>
                  )}
                </div>

                <p className="mt-4 max-w-3xl text-sm leading-6 text-cyan-50">
                  {result.clinical_reasoning ||
                    t("defaultClinicalReasoning", "Review the ranked differential, confirm the working diagnosis, and refine the suggested workup before training the system.")}
                </p>

                {result.uploaded_files?.length ? (
                  <p className="mt-3 text-xs text-cyan-100/90">
                    {t("analyzedFilesPrefix", "Analyzed files")}: {result.uploaded_files.join(", ")}
                  </p>
                ) : null}
              </div>

              <CardContent className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
                  <div className="flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("urgencyLevel", "Urgency Level")}</p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {urgencyLabel || t("clinicalReview", "Clinical review")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {firstSentence(result.clinical_reasoning) || t(urgencyNote.key, urgencyNote.fallback)}
                  </p>
                </div>

                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
                  <div className="flex items-center gap-2 text-cyan-700">
                    <Activity className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("differentialSpread", "Differential Spread")}</p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {secondaryCondition
                      ? t("leadOverNext", "{gap}-point lead over next differential", { gap: confidenceGap })
                      : t("singleDominantDifferential", "Single dominant differential available")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {differentialSummary
                      ? t("mainAlternatives", "Main alternatives: {alternatives}", { alternatives: differentialSummary })
                      : t("noAdditionalAlternatives", "No additional alternatives were surfaced beyond the lead condition.")}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 sm:col-span-2 xl:col-span-1">
                  <div className="flex items-center gap-2 text-emerald-700">
                    <ShieldCheck className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">{t("workupScope", "Workup Scope")}</p>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    {t(
                      recommendedTests.length + recommendedMedications.length >= 8
                        ? "workupComprehensive"
                        : recommendedTests.length + recommendedMedications.length >= 4
                          ? "workupModerate"
                          : "workupFocused",
                      getWorkupLabel(recommendedTests.length, recommendedMedications.length)
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {t("workupSummary", "{tests} tests and {medications} treatment items suggested for review.", {
                      tests: recommendedTests.length,
                      medications: recommendedMedications.length,
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <FileText className="h-5 w-5 text-cyan-700" />
                  {t("clinicalSnapshot", "Clinical Snapshot")}
                </CardTitle>
                <CardDescription>
                  {t("clinicalSnapshotDescription", "Supporting context around the current AI assessment.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("diagnosticPriorities", "Diagnostic Priorities")}
                  </p>
                  {diagnosticPriorities.length ? (
                    <div className="mt-2 space-y-2">
                      {diagnosticPriorities.map((test, index) => (
                        <p key={`${test}-${index}`} className="text-sm leading-6 text-slate-700">
                          {index + 1}. {test}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {t("noPriorityDiagnosticSteps", "No priority diagnostic steps were generated in this analysis.")}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("therapeuticConsiderations", "Therapeutic Considerations")}
                  </p>
                  {therapeuticPriorities.length ? (
                    <div className="mt-2 space-y-2">
                      {therapeuticPriorities.map((item, index) => (
                        <p key={`${item}-${index}`} className="text-sm leading-6 text-slate-700">
                          {index + 1}. {item}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {t("noTreatmentConsiderations", "No treatment considerations were generated in this analysis.")}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("expectedTimeline", "Expected Timeline")}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {result.recovery_timeline || t("timelineNotProvided", "Timeline not provided in this analysis.")}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {t("similarCaseMatches", "Similar Case Matches")}
                      </p>
                      <p className="mt-2 text-sm text-slate-700">
                        {t("historicalMatches", "{count} historical matches surfaced", {
                          count: result.similar_cases?.length || 0,
                        })}
                      </p>
                    </div>
                    <div className={`text-2xl font-semibold ${primaryTone.accent}`}>
                      {result.similar_cases?.length || 0}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {result.attachment_summaries?.length ? (
            <Card className="border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <Paperclip className="h-5 w-5 text-cyan-700" />
                  {t("analyzedUploads", "Analyzed Uploads")}
                </CardTitle>
                <CardDescription>
                  {t("analyzedUploadsDescription", "These uploaded files were converted into case context for the current clinical analysis.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.attachment_summaries.map((attachment) => (
                  <div
                    key={`${attachment.media_type}-${attachment.name}`}
                    className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                      {attachment.media_label || attachment.media_type}
                    </p>
                    <p className="mt-2 font-medium text-slate-900">{attachment.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{attachment.summary}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-cyan-100 bg-white/95 shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <AlertTriangle className="h-5 w-5 text-cyan-700" />
                  {t("possibleConditions", "Possible Conditions")}
                </CardTitle>
                <CardDescription>
                  {t("possibleConditionsDescription", "Ranked differential with confidence and severity cues.")}
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-cyan-200 text-cyan-700">
                {t("conditionsCount", "{count} conditions", {
                  count: result.possible_conditions?.length || 0,
                })}
              </Badge>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {result.possible_conditions?.map((condition, index) => {
                const tone = getMedicalTone(condition.severity || result.urgency);
                const confidence = condition.confidence ?? 0;

                return (
                  <div
                    key={`${condition.name}-${index}`}
                    className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t("conditionLabel", "Condition {index}", { index: index + 1 })}
                        </p>
                        <h4 className="mt-2 text-base font-semibold leading-6 text-slate-950">
                          {condition.display_name || condition.name}
                        </h4>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.pill}`}>
                        {condition.severity_display || condition.severity || t("review", "Review")}
                      </span>
                    </div>

                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-semibold text-slate-950">{confidence}%</p>
                        <p className="text-xs text-slate-500">
                          {t(
                            confidence >= 80
                              ? "highConfidence"
                              : confidence >= 60
                                ? "moderateConfidence"
                                : "needsValidation",
                            getConfidenceLabel(confidence)
                          )}
                        </p>
                      </div>
                      {index === 0 && (
                        <Badge className="bg-cyan-700 text-white hover:bg-cyan-700">{t("leadMatch", "Lead Match")}</Badge>
                      )}
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${tone.bar}`}
                        style={{ width: `${Math.max(0, Math.min(100, confidence))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <TestTube className="h-5 w-5 text-cyan-700" />
                  {t("recommendedTests", "Recommended Tests")}
                </CardTitle>
                <CardDescription>
                  {t("recommendedTestsDescription", "Diagnostic workup suggested by the AI assessment.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendedTests.length ? (
                  recommendedTests.map((test, index) => (
                    <div
                      key={`${test}-${index}`}
                      className="flex gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3"
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-slate-700">{test}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("noTestsRecommended", "No tests recommended in this response.")}</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <Pill className="h-5 w-5 text-cyan-700" />
                  {t("recommendedMedications", "Recommended Medications")}
                </CardTitle>
                <CardDescription>
                  {t("recommendedMedicationsDescription", "Treatment directions generated for clinician review.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendedMedications.length ? (
                  recommendedMedications.map((medication, index) => (
                    <div
                      key={`${medication}-${index}`}
                      className="flex gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3"
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-xs font-semibold text-white">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-slate-700">{medication}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">{t("noMedicationsRecommended", "No medication suggestions provided in this response.")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-cyan-100 bg-white/95 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <CheckCircle2 className="h-5 w-5 text-cyan-700" />
                  {t("doctorConfirmationWorkspace", "Doctor Confirmation Workspace")}
                </CardTitle>
                <CardDescription>
                  {t("doctorConfirmationDescription", "Confirm the working diagnosis and adjust the structured training payload before submission.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-800">{t("doctorFinalDiagnosis", "Doctor Final Diagnosis")}</p>
                <Textarea
                  ref={finalDiagnosisRef}
                  value={finalDiagnosis}
                  onFocus={() => setActiveField("finalDiagnosis")}
                  onChange={(e) => setFinalDiagnosis(e.target.value)}
                  placeholder={t("confirmOrCorrectDiagnosis", "Confirm or correct final diagnosis before training")}
                  className="min-h-[110px] rounded-2xl border-cyan-100 bg-slate-50/60 focus-visible:ring-cyan-500"
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t("doctorFinalTests", "Doctor Final Tests")}</p>
                  <Textarea
                    ref={finalTestsRef}
                    value={finalTests}
                    onFocus={() => setActiveField("finalTests")}
                    onChange={(e) => setFinalTests(e.target.value)}
                    placeholder={t("oneTestPerLine", "One test per line")}
                    className="min-h-[170px] rounded-2xl border-cyan-100 bg-slate-50/60 focus-visible:ring-cyan-500"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{t("doctorFinalMedications", "Doctor Final Medications")}</p>
                  <Textarea
                    ref={finalMedicationsRef}
                    value={finalMedications}
                    onFocus={() => setActiveField("finalMedications")}
                    onChange={(e) => setFinalMedications(e.target.value)}
                    placeholder={t("oneMedicationPerLine", "One medication or treatment per line")}
                    className="min-h-[170px] rounded-2xl border-cyan-100 bg-slate-50/60 focus-visible:ring-cyan-500"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  {t("confirmationSends", "Confirmation sends the reviewed diagnosis, tests, and medication list to the training pipeline.")}
                </p>
                <Button
                  className="w-full bg-cyan-700 hover:bg-cyan-800 sm:w-auto"
                  onClick={handleConfirmDiagnosis}
                  disabled={confirming}
                >
                  {confirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("confirming", "Confirming...")}
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      {t("confirmDiagnosis", "Confirm Diagnosis")}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result.similar_cases?.length ? (
            <Card className="border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <Activity className="h-5 w-5 text-cyan-700" />
                  {t("similarPastCases", "Similar Past Cases")}
                </CardTitle>
                <CardDescription>
                  {t("similarPastCasesDescription", "Historical cases with related workups and treatment patterns.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-2">
                {result.similar_cases.map((caseItem, index) => (
                  <div
                    key={`similar-case-${index}`}
                    className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{t("caseMatch", "Case Match {index}", { index: index + 1 })}</p>
                      <Badge variant="outline" className="border-cyan-200 text-cyan-700">
                        {t("similarity", "{value}% similarity", { value: formatSimilarity(caseItem.distance) })}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t("tests", "Tests")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {caseItem.tests_display?.length
                            ? caseItem.tests_display.join(", ")
                            : caseItem.tests?.length
                              ? caseItem.tests.join(", ")
                              : t("noTestHistory", "No test history available")}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {t("medications", "Medications")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                          {caseItem.meds_display?.length
                            ? caseItem.meds_display.join(", ")
                            : caseItem.meds?.length
                              ? caseItem.meds.join(", ")
                              : t("noMedicationHistory", "No medication history available")}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default DoctorAnalyzer;
