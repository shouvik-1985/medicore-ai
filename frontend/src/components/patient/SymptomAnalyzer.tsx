import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { API_URL } from "@/lib/api";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import VirtualKeyboard from "@/components/shared/VirtualKeyboard";
import {
  Activity,
  Apple,
  AlertTriangle,
  Brain,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Heart,
  Languages,
  Loader2,
  Paperclip,
  Search,
  Shield,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import {
  formatAnalyzerUiText,
  getAnalyzerLanguage,
  getAnalyzerLanguageStorageKey,
  insertTextAtCursor,
  removeTextAtCursor,
  shouldShowVirtualKeyboard,
} from "@/lib/analyzerLanguage";

interface Condition {
  name: string;
  severity: string;
  confidence: number;
  display_name?: string;
  severity_display?: string;
}

interface AttachmentSummary {
  media_type: string;
  name: string;
  summary: string;
  media_label?: string;
}

interface AnalysisResult {
  diagnosis: string;
  severity: string;
  report_text: string;
  clinical_reasoning?: string;
  possible_conditions: Condition[];
  recommended_medications: string[];
  recommended_tests: string[];
  precautions: string[];
  diet_recommendations: string[];
  specialist_consultation: string;
  recovery_timeline: string;
  urgency: string;
  disclaimer?: string;
  confidence_score?: number;
  ml_prediction?: string;
  dl_prediction?: string;
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

const PATIENT_LANGUAGE_STORAGE_KEY = getAnalyzerLanguageStorageKey("patient");

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

const getUrgencyTheme = (value?: string) => {
  const normalized = String(value || "").toLowerCase();

  if (normalized.includes("high") || normalized.includes("severe") || normalized.includes("urgent")) {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      surface: "from-rose-500/10 via-white to-orange-500/10",
      accent: "text-rose-700",
      note: "Please seek timely medical care and use the precautions below closely.",
    };
  }

  if (normalized.includes("moderate") || normalized.includes("medium")) {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      surface: "from-amber-500/10 via-white to-yellow-500/10",
      accent: "text-amber-700",
      note: "A clinician review is sensible soon, especially if symptoms continue or worsen.",
    };
  }

  return {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    surface: "from-emerald-500/10 via-white to-cyan-500/10",
    accent: "text-emerald-700",
    note: "This looks suitable for steady follow-up while you monitor symptoms carefully.",
  };
};

const getConfidenceLabel = (confidence: number) => {
  if (confidence >= 75) return "Stronger match";
  if (confidence >= 50) return "Possible match";
  return "Lower certainty";
};

const getSeverityBadgeVariant = (severity?: string) => {
  const normalized = String(severity || "").toLowerCase();

  if (normalized.includes("mild") || normalized.includes("low")) {
    return "secondary" as const;
  }

  return "destructive" as const;
};

const firstSentence = (value?: string) => {
  const text = String(value || "").trim();
  if (!text) return "";

  const match = text.match(/^.*?[.!?](\s|$)/);
  return match ? match[0].trim() : text;
};

const SymptomAnalyzer = () => {
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    return localStorage.getItem(PATIENT_LANGUAGE_STORAGE_KEY) || "en";
  });
  const [symptoms, setSymptoms] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showKeyboard, setShowKeyboard] = useState(() => shouldShowVirtualKeyboard(language));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const symptomInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    localStorage.setItem(PATIENT_LANGUAGE_STORAGE_KEY, language);
    setShowKeyboard(shouldShowVirtualKeyboard(language));
  }, [language]);

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
    setAnalysisResult(null);
    event.target.value = "";
  };

  const removeSelectedFile = (targetFile: File) => {
    setSelectedFiles((previous) =>
      previous.filter(
        (file) =>
          !(file.name === targetFile.name && file.size === targetFile.size && file.lastModified === targetFile.lastModified)
      )
    );
    setAnalysisResult(null);
  };

  const handleAnalyze = async () => {
    if (!symptoms.trim() && !selectedFiles.length) {
      toast.error("Please describe symptoms or upload a medical file");
      return;
    }

    const formData = new FormData();
    formData.append("symptoms", symptoms.trim());
    formData.append("response_language", language);
    selectedFiles.forEach((file) => formData.append("attachments", file));

    setAnalysisResult(null);
    setIsAnalyzing(true);
    try {
      const response = await axios.post<AnalysisResult>(
        `${API_URL}/api/diagnosis/analyze/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "multipart/form-data",
          }
        }
      );

      const data = response.data;
      setAnalysisResult(data);

      toast.success("Analysis complete! Your case has been analyzed.");
    } catch (error) {
      console.error("Symptom analysis failed:", error);
      const message =
        axios.isAxiosError(error)
          ? error.response?.data?.error || "Failed to analyze the submitted case."
          : "Failed to analyze the submitted case.";
      toast.error(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generatePDFReport = async () => {
    if (!analysisResult) return;

    try {
      const response = await axios.post<Blob>(
        `${API_URL}/api/diagnosis/generate-pdf/`,
        {
          ...analysisResult,
          symptoms: analysisResult.input_summary || symptoms,
          response_language: language,
          status: "Completed",
        },
        {
          responseType: "blob",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "application/json"
          }
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "diagnosis_report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast.success("PDF report downloaded successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate PDF report.");
    }
  };

  const primaryCondition = analysisResult?.possible_conditions?.[0];
  const urgencyTheme = getUrgencyTheme(analysisResult?.urgency || primaryCondition?.severity);
  const primaryConditionName =
    primaryCondition?.display_name || primaryCondition?.name || analysisResult?.diagnosis_display || analysisResult?.diagnosis;
  const primarySeverityLabel =
    primaryCondition?.severity_display || primaryCondition?.severity || analysisResult?.severity_display || analysisResult?.severity;
  const urgencyLabel = analysisResult?.urgency_display || analysisResult?.urgency || primarySeverityLabel;
  const selectedLanguage = getAnalyzerLanguage(language);
  const uiCopy = analysisResult?.ui_copy;
  const t = (key: string, fallback: string, values?: Record<string, string | number>) =>
    formatAnalyzerUiText(uiCopy, key, fallback, values);

  const handleKeyboardInsert = (value: string) => {
    insertTextAtCursor(symptomInputRef.current, symptoms, value, setSymptoms);
    setAnalysisResult(null);
  };

  const handleKeyboardBackspace = () => {
    removeTextAtCursor(symptomInputRef.current, symptoms, (nextValue) => {
      setSymptoms(nextValue);
      setAnalysisResult(null);
    });
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-blue-100 shadow-sm">
        <div className="bg-gradient-to-br from-blue-50 via-white to-cyan-50">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 shadow-sm">
                  <Brain className="h-3.5 w-3.5" />
                  Gentle AI Health Check
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl text-blue-900">
                    <Heart className="h-6 w-6 text-rose-500" />
                    AI Symptom Analyzer
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-2xl text-base text-slate-600">
                    Share what you are feeling in your own words and get a calm, patient-friendly health summary with care guidance.
                  </CardDescription>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:w-[360px] lg:items-end">
                <div className="w-full max-w-[260px] rounded-2xl border border-blue-100 bg-white/90 p-3 shadow-sm">
                  <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                    <Languages className="h-3.5 w-3.5" />
                    Output Language
                  </p>
                  <Select
                    value={language}
                    onValueChange={(value) => {
                      setLanguage(value);
                      setAnalysisResult(null);
                    }}
                  >
                    <SelectTrigger className="border-blue-200 bg-white text-slate-700">
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
                </div>

                <div className="rounded-2xl border border-blue-100 bg-white/90 p-3 text-sm text-slate-600 shadow-sm max-w-[260px]">
                  Include how long symptoms have been happening and whether they are getting worse.
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept={ANALYZER_ACCEPT}
              multiple
              onChange={handleFileSelection}
              className="hidden"
            />

            {shouldShowVirtualKeyboard(language) ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    {selectedLanguage.label} input support is enabled
                  </p>
                  <p className="text-xs text-blue-700">
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
              ref={symptomInputRef}
              placeholder="Describe your symptoms in detail, or upload an image, PDF, Word file, audio, or video..."
              value={symptoms}
              onChange={(e) => {
                setSymptoms(e.target.value);
                setAnalysisResult(null);
              }}
              className="min-h-32 rounded-2xl border-blue-100 bg-white/95 text-slate-700 shadow-sm focus-visible:ring-blue-500"
            />

            <div className="rounded-2xl border border-dashed border-blue-200 bg-white/85 p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Add medical evidence</p>
                  <p className="text-xs text-slate-500">
                    Upload image, PDF, Word, audio, or video files. You can analyze files alone or combine them with typed symptoms.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
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
                        className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-900"
                      >
                        <FileIcon className="h-3.5 w-3.5" />
                        <span className="max-w-[180px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(file)}
                          className="text-blue-500 transition hover:text-blue-700"
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
                The more clearly you describe the pattern of your symptoms and uploads, the better the guidance can be.
              </p>
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing Case...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Analyze Symptoms
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>

      {analysisResult && (
        <div className="space-y-6">
          <Card className="overflow-hidden border-blue-100 shadow-sm">
            <div className={`bg-gradient-to-br ${urgencyTheme.surface} p-5 sm:p-6`}>
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
                    {t("healthInsight", "Your Health Insight")}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {primaryConditionName || t("assessmentReady", "Assessment ready")}
                  </h3>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${urgencyTheme.badge}`}>
                      {urgencyLabel || t("monitorSymptoms", "Monitor symptoms")}
                    </span>
                    <span className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
                      {`${primaryCondition?.confidence ?? 0}% ${t("topMatch", "top match")}`}
                    </span>
                    {(analysisResult.input_modalities_display || analysisResult.input_modalities || []).map((modality) => (
                      <span
                        key={modality}
                        className="rounded-full border border-blue-100 bg-white px-3 py-1 text-xs font-semibold uppercase text-slate-600"
                      >
                        {modality}
                      </span>
                    ))}
                  </div>

                  <p className="mt-4 text-sm leading-7 text-slate-700">
                    {analysisResult.clinical_reasoning ||
                      analysisResult.disclaimer ||
                      t("defaultClinicalReasoning", "This AI summary is meant to guide you, not replace a doctor. Use the urgency and precautions below to decide how soon you should seek care.")}
                  </p>

                  {analysisResult.uploaded_files?.length ? (
                    <p className="mt-3 text-xs text-slate-500">
                      {t("analyzedFilesPrefix", "Analyzed files")}: {analysisResult.uploaded_files.join(", ")}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3 xl:w-[420px] xl:grid-cols-1">
                  <div className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t("likelyConcern", "Likely Concern")}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {primaryConditionName || t("noPrimaryConcern", "No primary concern listed")}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t("howSoonToAct", "How Soon To Act")}
                    </p>
                    <p className={`mt-2 text-sm font-medium ${urgencyTheme.accent}`}>
                      {firstSentence(analysisResult.clinical_reasoning || analysisResult.disclaimer) || urgencyTheme.note}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {t("suggestedNextStep", "Suggested Next Step")}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {firstSentence(analysisResult.specialist_consultation) || t("fallbackNextStep", "Arrange a medical review if symptoms keep bothering you or become stronger.")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {analysisResult.attachment_summaries?.length ? (
            <Card className="border-blue-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Paperclip className="h-5 w-5" />
                  {t("analyzedUploads", "Analyzed Uploads")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("analyzedUploadsDescription", "These uploaded files were converted into clinical context for the same analysis.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysisResult.attachment_summaries.map((attachment) => (
                  <div
                    key={`${attachment.media_type}-${attachment.name}`}
                    className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                      {attachment.media_label || attachment.media_type}
                    </p>
                    <p className="mt-2 font-medium text-slate-900">{attachment.name}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{attachment.summary}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="border-emerald-100 bg-white/95 shadow-sm">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-emerald-900">
                  <AlertTriangle className="h-5 w-5" />
                  {t("possibleConditions", "Possible Conditions")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("possibleConditionsDescription", "These are possible explanations based on the symptoms you described.")}
                </CardDescription>
              </div>
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                {t("matchesCount", "{count} matches", {
                  count: analysisResult.possible_conditions?.length || 0,
                })}
              </Badge>
            </CardHeader>

            <CardContent className="grid gap-4 lg:grid-cols-2">
              {analysisResult?.possible_conditions?.slice(0, 6)?.map((condition, index) => (
                <div
                  key={`${condition.name}-${index}`}
                  className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/50 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {t("optionLabel", "Option {index}", { index: index + 1 })}
                      </p>
                      <h4 className="mt-2 text-base font-semibold leading-6 text-emerald-950">
                        {condition.display_name || condition.name}
                      </h4>
                    </div>

                    <Badge
                      variant={getSeverityBadgeVariant(condition.severity)}
                      className={condition.severity?.toLowerCase().includes("mild")
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                        : undefined}
                    >
                      {condition.severity_display || condition.severity}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-semibold text-slate-950">{condition.confidence}%</p>
                      <p className="text-xs text-slate-500">
                        {t(
                          condition.confidence >= 75
                            ? "strongerMatch"
                            : condition.confidence >= 50
                              ? "possibleMatch"
                              : "lowerCertainty",
                          getConfidenceLabel(condition.confidence)
                        )}
                      </p>
                    </div>
                    {index === 0 && (
                      <Badge className="bg-emerald-700 text-white hover:bg-emerald-700">{t("topInsight", "Top Insight")}</Badge>
                    )}
                  </div>

                  <Progress value={condition.confidence} className="mt-4 h-2 bg-emerald-100" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-rose-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-rose-800">
                  <Shield className="h-5 w-5" />
                  {t("precautions", "Precautions")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("precautionsDescription", "Helpful safety steps based on the symptom pattern you shared.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysisResult?.precautions?.map((precaution, index) => (
                  <div
                    key={`${precaution}-${index}`}
                    className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-3"
                  >
                    <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                    <p className="text-sm leading-6 text-rose-900">{precaution}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-emerald-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-800">
                  <Apple className="h-5 w-5" />
                  {t("dietRecommendations", "Diet Recommendations")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("dietRecommendationsDescription", "Food and hydration ideas that may support you while symptoms are being assessed.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysisResult?.diet_recommendations?.map((diet, index) => (
                  <div
                    key={`${diet}-${index}`}
                    className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3"
                  >
                    <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                    <p className="text-sm leading-6 text-emerald-950">{diet}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-blue-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Stethoscope className="h-5 w-5" />
                  {t("whoMayHelp", "Who May Help")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("whoMayHelpDescription", "This suggests the type of clinician or follow-up that may be useful.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-7 text-blue-900">
                  {analysisResult.specialist_consultation || t("fallbackConsultation", "A general medical review would be a reasonable next step if symptoms continue.")}
                </p>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-indigo-900">
                  <Activity className="h-5 w-5" />
                  {t("recoveryOutlook", "Recovery Outlook")}
                </CardTitle>
                <CardDescription className="text-slate-600">
                  {t("recoveryOutlookDescription", "A general idea of how symptoms may improve once the cause is addressed.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-7 text-indigo-900">
                  {analysisResult.recovery_timeline || t("fallbackRecovery", "Recovery timing depends on the underlying cause and the treatment plan.")}
                </p>
                <Separator className="my-4 bg-indigo-100" />
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
                    {t("urgency", "Urgency")}
                  </p>
                  <p className="mt-2 text-sm font-medium text-indigo-900">
                    {analysisResult.urgency_display || analysisResult.urgency || t("monitorSymptoms", "Monitor symptoms and seek care if they worsen.")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-blue-100 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-blue-900">{t("saveSummary", "Save Your Health Summary")}</h3>
                  <p className="mt-1 text-sm text-blue-700">
                    {t("saveSummaryDescription", "Download a patient-friendly PDF report of this analysis for future reference.")}
                  </p>
                </div>
                <Button onClick={generatePDFReport} className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
                  <Download className="mr-2 h-4 w-4" />
                  {t("downloadPdf", "Download PDF Report")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default SymptomAnalyzer;
