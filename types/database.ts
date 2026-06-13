/**
 * types/database.ts
 * Full TypeScript types matching every table in SCHEMA.md.
 * Structured as a Supabase-compatible Database type.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── ENUM TYPES ─────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'teacher' | 'student'
export type QuestionType = 'multiple_choice' | 'short_answer'
export type QuestionDifficulty = 'easy' | 'medium' | 'hard'
export type SubjectType = 'reading_writing' | 'math'
export type ShowResultsType = 'immediately' | 'after_deadline'
export type ScoreVisibility = 'on_submit' | 'on_partial' | 'after_all_students' | 'after_deadline'
export type AnswerVisibility = 'on_submit' | 'on_partial' | 'after_all_students' | 'after_deadline' | 'after_score_threshold'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type SubmissionStatus = 'in_progress' | 'grading' | 'submitted' | 'expired'
export type TabEventType = 'tab_switch' | 'window_blur' | 'window_focus'
export type FileType = 'pdf' | 'word' | 'video_link'
export type FileImportStatus = 'processing' | 'parsed' | 'success' | 'partial_success' | 'failed'
export type SourceFileType = 'docx' | 'pdf'

// ─── TABLE ROW TYPES ─────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          role: UserRole
          full_name: string
          phone: string | null
          avatar_url: string | null
          is_active: boolean
          is_approved: boolean
          birth_year: number | null
          gender: string | null
          school: string | null
          city: string | null
          facebook_url: string | null
          threads_url: string | null
          hobbies: string | null
          target_score: number | null
          source: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          role?: UserRole
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
          is_approved?: boolean
          birth_year?: number | null
          gender?: string | null
          school?: string | null
          city?: string | null
          facebook_url?: string | null
          threads_url?: string | null
          hobbies?: string | null
          target_score?: number | null
          source?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          role?: UserRole
          full_name?: string
          phone?: string | null
          avatar_url?: string | null
          is_active?: boolean
          is_approved?: boolean
          birth_year?: number | null
          gender?: string | null
          school?: string | null
          city?: string | null
          facebook_url?: string | null
          threads_url?: string | null
          hobbies?: string | null
          target_score?: number | null
          source?: string | null
          updated_at?: string
        }
      }

      device_sessions: {
        Row: {
          id: string
          user_id: string
          session_token: string
          device_info: string | null
          logged_in_at: string
          last_active_at: string
          is_violation: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_token: string
          device_info?: string | null
          logged_in_at?: string
          last_active_at?: string
          is_violation?: boolean
          created_at?: string
        }
        Update: {
          session_token?: string
          device_info?: string | null
          last_active_at?: string
          is_violation?: boolean
        }
      }

      file_imports: {
        Row: {
          id: string
          uploaded_by: string
          original_filename: string
          storage_bucket: string
          storage_path: string
          latex_storage_path: string | null
          file_type: SourceFileType
          mime_type: string
          file_size_bytes: number
          import_type: string
          source_context: string | null
          total_records: number
          success_count: number
          failure_count: number
          status: FileImportStatus
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          uploaded_by: string
          original_filename: string
          storage_bucket?: string
          storage_path: string
          latex_storage_path?: string | null
          file_type: SourceFileType
          mime_type: string
          file_size_bytes: number
          import_type?: string
          source_context?: string | null
          total_records?: number
          success_count?: number
          failure_count?: number
          status?: FileImportStatus
          error_message?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          original_filename?: string
          storage_bucket?: string
          storage_path?: string
          latex_storage_path?: string | null
          file_type?: SourceFileType
          mime_type?: string
          file_size_bytes?: number
          import_type?: string
          source_context?: string | null
          total_records?: number
          success_count?: number
          failure_count?: number
          status?: FileImportStatus
          error_message?: string | null
          updated_at?: string
        }
      }

      courses: {
        Row: {
          id: string
          teacher_id: string
          title: string
          start_date: string
          end_date: string
          expires_at: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          title: string
          start_date: string
          end_date: string
          expires_at?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          teacher_id?: string
          title?: string
          start_date?: string
          end_date?: string
          expires_at?: string | null
          archived_at?: string | null
          updated_at?: string
        }
      }

      classes: {
        Row: {
          id: string
          course_id: string
          title: string
          schedule_text: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          course_id: string
          title: string
          schedule_text: string
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          title?: string
          schedule_text?: string
          archived_at?: string | null
          updated_at?: string
        }
      }

      enrollments: {
        Row: {
          id: string
          student_id: string
          class_id: string
          enrolled_at: string
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          class_id: string
          enrolled_at?: string
          created_at?: string
        }
        Update: {
          enrolled_at?: string
        }
      }

      weeks: {
        Row: {
          id: string
          class_id: string
          title: string
          order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          title: string
          order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          title?: string
          order?: number
          updated_at?: string
        }
      }

      tags: {
        Row: {
          id: string
          subject: SubjectType
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          subject: SubjectType
          name: string
          created_at?: string
        }
        Update: {
          subject?: SubjectType
          name?: string
        }
      }

      questions: {
        Row: {
          id: string
          created_by: string
          type: QuestionType
          content: string
          stimulus: string | null
          prompt: string | null
          subject: SubjectType | null
          image_url: string | null
          difficulty: QuestionDifficulty | null
          content_hash: string
          ai_explanation: string | null
          teacher_explanation: string | null
          video_url: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          type: QuestionType
          content: string
          stimulus?: string | null
          prompt?: string | null
          subject?: SubjectType | null
          image_url?: string | null
          difficulty?: QuestionDifficulty | null
          content_hash: string
          ai_explanation?: string | null
          teacher_explanation?: string | null
          video_url?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          type?: QuestionType
          content?: string
          stimulus?: string | null
          prompt?: string | null
          subject?: SubjectType | null
          image_url?: string | null
          difficulty?: QuestionDifficulty | null
          content_hash?: string
          ai_explanation?: string | null
          teacher_explanation?: string | null
          video_url?: string | null
          archived_at?: string | null
          updated_at?: string
        }
      }

      question_options: {
        Row: {
          id: string
          question_id: string
          label: string
          content: string
          is_correct: boolean
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          label: string
          content: string
          is_correct?: boolean
          order?: number
          created_at?: string
        }
        Update: {
          label?: string
          content?: string
          is_correct?: boolean
          order?: number
        }
      }

      question_accepted_answers: {
        Row: {
          id: string
          question_id: string
          answer_text: string
          created_at: string
        }
        Insert: {
          id?: string
          question_id: string
          answer_text: string
          created_at?: string
        }
        Update: {
          answer_text?: string
        }
      }

      question_tags: {
        Row: {
          question_id: string
          tag_id: string
        }
        Insert: {
          question_id: string
          tag_id: string
        }
        Update: {
          question_id?: string
          tag_id?: string
        }
      }

      assignments: {
        Row: {
          id: string
          created_by: string
          title: string
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          title: string
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          archived_at?: string | null
          updated_at?: string
        }
      }

      assignment_questions: {
        Row: {
          id: string
          assignment_id: string
          question_id: string
          order: number
          score_weight: number
          created_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          question_id: string
          order?: number
          score_weight?: number
          created_at?: string
        }
        Update: {
          order?: number
          score_weight?: number
        }
      }

      assignment_instances: {
        Row: {
          id: string
          assignment_id: string
          class_id: string
          week_id: string
          deadline: string
          is_timed: boolean
          time_limit_seconds: number | null
          show_results: ShowResultsType
          shuffle_questions: boolean
          shuffle_options: boolean
          max_retakes: number
          alert_enabled: boolean
          published_at: string | null
          start_at: string | null
          allow_resume: boolean
          score_visibility: ScoreVisibility
          answer_visibility: AnswerVisibility
          answer_visibility_threshold: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          class_id: string
          week_id: string
          deadline: string
          is_timed?: boolean
          time_limit_seconds?: number | null
          show_results?: ShowResultsType
          shuffle_questions?: boolean
          shuffle_options?: boolean
          max_retakes?: number
          alert_enabled?: boolean
          published_at?: string | null
          start_at?: string | null
          allow_resume?: boolean
          score_visibility?: ScoreVisibility
          answer_visibility?: AnswerVisibility
          answer_visibility_threshold?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          deadline?: string
          is_timed?: boolean
          time_limit_seconds?: number | null
          show_results?: ShowResultsType
          shuffle_questions?: boolean
          shuffle_options?: boolean
          max_retakes?: number
          alert_enabled?: boolean
          published_at?: string | null
          start_at?: string | null
          allow_resume?: boolean
          score_visibility?: ScoreVisibility
          answer_visibility?: AnswerVisibility
          answer_visibility_threshold?: number | null
          updated_at?: string
        }
      }

      submissions: {
        Row: {
          id: string
          instance_id: string
          student_id: string
          attempt_number: number
          status: SubmissionStatus
          raw_score: number | null
          scaled_score: number | null
          total_questions: number | null
          current_question_id: string | null
          current_module: string | null
          started_at: string
          submitted_at: string | null
          time_spent_seconds: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          instance_id: string
          student_id: string
          attempt_number?: number
          status?: SubmissionStatus
          raw_score?: number | null
          scaled_score?: number | null
          total_questions?: number | null
          current_question_id?: string | null
          current_module?: string | null
          started_at?: string
          submitted_at?: string | null
          time_spent_seconds?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          attempt_number?: number
          status?: SubmissionStatus
          raw_score?: number | null
          scaled_score?: number | null
          total_questions?: number | null
          current_question_id?: string | null
          current_module?: string | null
          submitted_at?: string | null
          time_spent_seconds?: number | null
          updated_at?: string
        }
      }

      submission_answers: {
        Row: {
          id: string
          submission_id: string
          question_id: string
          selected_option_id: string | null
          answer_text: string | null
          is_correct: boolean | null
          is_marked_for_review: boolean
          highlight_data: Json | null
          note_text: string | null
          strikethrough_data: Json | null
          time_spent_seconds: number | null
          confidence: ConfidenceLevel | null
          answered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          question_id: string
          selected_option_id?: string | null
          answer_text?: string | null
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          highlight_data?: Json | null
          note_text?: string | null
          strikethrough_data?: Json | null
          time_spent_seconds?: number | null
          confidence?: ConfidenceLevel | null
          answered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          selected_option_id?: string | null
          answer_text?: string | null
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          highlight_data?: Json | null
          note_text?: string | null
          strikethrough_data?: Json | null
          time_spent_seconds?: number | null
          confidence?: ConfidenceLevel | null
          answered_at?: string | null
          updated_at?: string
        }
      }

      error_log: {
        Row: {
          id: string
          student_id: string
          submission_id: string
          question_id: string
          student_note: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          submission_id: string
          question_id: string
          student_note?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          // Only student_note can be updated
          student_note?: string | null
          updated_at?: string
        }
      }

      assignment_extensions: {
        Row: {
          id: string
          instance_id: string
          student_id: string
          extended_deadline: string
          note: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          instance_id: string
          student_id: string
          extended_deadline: string
          note?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          extended_deadline?: string
          note?: string | null
          updated_at?: string
        }
      }

      performance_thresholds: {
        Row: {
          teacher_id: string
          excellent_pct: number
          target_pct: number
          watch_pct: number
          updated_at: string
        }
        Insert: {
          teacher_id: string
          excellent_pct?: number
          target_pct?: number
          watch_pct?: number
          updated_at?: string
        }
        Update: {
          excellent_pct?: number
          target_pct?: number
          watch_pct?: number
          updated_at?: string
        }
      }

      tab_switch_events: {
        Row: {
          id: string
          submission_id: string
          student_id: string
          event_type: TabEventType
          occurred_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          student_id: string
          event_type: TabEventType
          occurred_at?: string
        }
        Update: Record<string, never>
      }

      class_library_folders: {
        Row: {
          id: string
          class_id: string
          title: string
          order: number
          created_at: string
        }
        Insert: {
          id?: string
          class_id: string
          title: string
          order?: number
          created_at?: string
        }
        Update: {
          title?: string
          order?: number
        }
      }

      class_library_files: {
        Row: {
          id: string
          folder_id: string
          title: string
          file_url: string
          file_type: FileType
          uploaded_by: string
          created_at: string
        }
        Insert: {
          id?: string
          folder_id: string
          title: string
          file_url: string
          file_type: FileType
          uploaded_by: string
          created_at?: string
        }
        Update: {
          title?: string
          file_url?: string
          file_type?: FileType
        }
      }

      notifications: {
        Row: {
          id: string
          class_id: string
          sent_by: string
          message: string
          sent_at: string
          created_at: string
        }
        Insert: {
          id?: string
          class_id: string
          sent_by: string
          message: string
          sent_at?: string
          created_at?: string
        }
        Update: {
          message?: string
        }
      }

      exam_papers: {
        Row: {
          id: string
          created_by: string
          title: string
          source: string | null
          year: number | null
          description: string | null
          archived_at: string | null
          is_public: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by: string
          title: string
          source?: string | null
          year?: number | null
          description?: string | null
          archived_at?: string | null
          is_public?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          source?: string | null
          year?: number | null
          description?: string | null
          archived_at?: string | null
          is_public?: boolean
          updated_at?: string
        }
      }

      exam_paper_questions: {
        Row: {
          id: string
          exam_paper_id: string
          question_id: string
          module_name: string | null
          order_index: number
          score_weight: number
          created_at: string
        }
        Insert: {
          id?: string
          exam_paper_id: string
          question_id: string
          module_name?: string | null
          order_index?: number
          score_weight?: number
          created_at?: string
        }
        Update: {
          module_name?: string | null
          order_index?: number
          score_weight?: number
        }
      }

      practice_test_assignments: {
        Row: {
          id: string
          practice_test_id: string
          class_id: string
          week_id: string | null
          deadline: string
          is_timed: boolean
          time_limit_seconds: number | null
          show_results: ShowResultsType
          max_retakes: number
          published_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_test_id: string
          class_id: string
          week_id?: string | null
          deadline: string
          is_timed?: boolean
          time_limit_seconds?: number | null
          show_results?: ShowResultsType
          max_retakes?: number
          published_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          week_id?: string | null
          deadline?: string
          is_timed?: boolean
          time_limit_seconds?: number | null
          show_results?: ShowResultsType
          max_retakes?: number
          published_at?: string | null
          updated_at?: string
        }
      }

      practice_test_attempts: {
        Row: {
          id: string
          practice_test_assignment_id: string
          student_id: string
          attempt_number: number
          status: SubmissionStatus
          current_question_id: string | null
          current_module: string | null
          raw_score: number | null
          total_questions: number | null
          started_at: string
          submitted_at: string | null
          time_spent_seconds: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_test_assignment_id: string
          student_id: string
          attempt_number?: number
          status?: SubmissionStatus
          current_question_id?: string | null
          current_module?: string | null
          raw_score?: number | null
          total_questions?: number | null
          started_at?: string
          submitted_at?: string | null
          time_spent_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: SubmissionStatus
          current_question_id?: string | null
          current_module?: string | null
          raw_score?: number | null
          total_questions?: number | null
          submitted_at?: string | null
          time_spent_seconds?: number
          updated_at?: string
        }
      }

      practice_test_answers: {
        Row: {
          id: string
          attempt_id: string
          question_id: string
          selected_option_id: string | null
          answer_text: string | null
          is_correct: boolean | null
          is_marked_for_review: boolean
          highlight_data: Json | null
          note_text: string | null
          strikethrough_data: Json | null
          time_spent_seconds: number
          answered_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          attempt_id: string
          question_id: string
          selected_option_id?: string | null
          answer_text?: string | null
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          highlight_data?: Json | null
          note_text?: string | null
          strikethrough_data?: Json | null
          time_spent_seconds?: number
          answered_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          selected_option_id?: string | null
          answer_text?: string | null
          is_correct?: boolean | null
          is_marked_for_review?: boolean
          highlight_data?: Json | null
          note_text?: string | null
          strikethrough_data?: Json | null
          time_spent_seconds?: number
          answered_at?: string | null
          updated_at?: string
        }
      }
    }

    Views: Record<string, never>
    Functions: {
      archive_expired_courses: {
        Args: Record<string, never>
        Returns: void
      }
      create_submission_attempt: {
        Args: {
          p_instance_id: string
        }
        Returns: {
          id: string
          instance_id: string
          attempt_number: number
          status: SubmissionStatus
          started_at: string
          current_question_id: string | null
          current_module: string | null
        }[]
      }
    }
    Enums: {
      user_role: UserRole
      question_type: QuestionType
      question_difficulty: QuestionDifficulty
      subject_type: SubjectType
      show_results_type: ShowResultsType
      submission_status: SubmissionStatus
      tab_event_type: TabEventType
      file_type: FileType
    }
  }
}

// ─── CONVENIENCE ROW TYPES ───────────────────────────────────────────────────

export type Profile = Database['public']['Tables']['profiles']['Row']
export type DeviceSession = Database['public']['Tables']['device_sessions']['Row']
export type FileImport = Database['public']['Tables']['file_imports']['Row']
export type Course = Database['public']['Tables']['courses']['Row']
export type Class = Database['public']['Tables']['classes']['Row']
export type Enrollment = Database['public']['Tables']['enrollments']['Row']
export type Week = Database['public']['Tables']['weeks']['Row']
export type Tag = Database['public']['Tables']['tags']['Row']
export type Question = Database['public']['Tables']['questions']['Row']
export type QuestionOption = Database['public']['Tables']['question_options']['Row']
export type QuestionAcceptedAnswer = Database['public']['Tables']['question_accepted_answers']['Row']
export type QuestionTag = Database['public']['Tables']['question_tags']['Row']
export type Assignment = Database['public']['Tables']['assignments']['Row']
export type AssignmentQuestion = Database['public']['Tables']['assignment_questions']['Row']
export type AssignmentInstance = Database['public']['Tables']['assignment_instances']['Row']
export type Submission = Database['public']['Tables']['submissions']['Row']
export type SubmissionAnswer = Database['public']['Tables']['submission_answers']['Row']
export type AssignmentExtension = Database['public']['Tables']['assignment_extensions']['Row']
export type PerformanceThresholds = Database['public']['Tables']['performance_thresholds']['Row']
export type ErrorLog = Database['public']['Tables']['error_log']['Row']
export type TabSwitchEvent = Database['public']['Tables']['tab_switch_events']['Row']
export type ClassLibraryFolder = Database['public']['Tables']['class_library_folders']['Row']
export type ClassLibraryFile = Database['public']['Tables']['class_library_files']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']
export type ExamPaper = Database['public']['Tables']['exam_papers']['Row']
export type ExamPaperQuestion = Database['public']['Tables']['exam_paper_questions']['Row']
export type PracticeTestAssignment = Database['public']['Tables']['practice_test_assignments']['Row']
export type PracticeTestAttempt = Database['public']['Tables']['practice_test_attempts']['Row']
export type PracticeTestAnswer = Database['public']['Tables']['practice_test_answers']['Row']

// ─── INSERT TYPES ────────────────────────────────────────────────────────────

export type InsertProfile = Database['public']['Tables']['profiles']['Insert']
export type InsertDeviceSession = Database['public']['Tables']['device_sessions']['Insert']
export type InsertFileImport = Database['public']['Tables']['file_imports']['Insert']
export type InsertCourse = Database['public']['Tables']['courses']['Insert']
export type InsertClass = Database['public']['Tables']['classes']['Insert']
export type InsertEnrollment = Database['public']['Tables']['enrollments']['Insert']
export type InsertWeek = Database['public']['Tables']['weeks']['Insert']
export type InsertTag = Database['public']['Tables']['tags']['Insert']
export type InsertQuestion = Database['public']['Tables']['questions']['Insert']
export type InsertQuestionOption = Database['public']['Tables']['question_options']['Insert']
export type InsertQuestionAcceptedAnswer = Database['public']['Tables']['question_accepted_answers']['Insert']
export type InsertAssignment = Database['public']['Tables']['assignments']['Insert']
export type InsertAssignmentQuestion = Database['public']['Tables']['assignment_questions']['Insert']
export type InsertAssignmentInstance = Database['public']['Tables']['assignment_instances']['Insert']
export type InsertSubmission = Database['public']['Tables']['submissions']['Insert']
export type InsertSubmissionAnswer = Database['public']['Tables']['submission_answers']['Insert']
export type InsertErrorLog = Database['public']['Tables']['error_log']['Insert']
export type InsertTabSwitchEvent = Database['public']['Tables']['tab_switch_events']['Insert']
export type InsertClassLibraryFolder = Database['public']['Tables']['class_library_folders']['Insert']
export type InsertClassLibraryFile = Database['public']['Tables']['class_library_files']['Insert']
export type InsertNotification = Database['public']['Tables']['notifications']['Insert']
export type InsertExamPaper = Database['public']['Tables']['exam_papers']['Insert']
export type InsertExamPaperQuestion = Database['public']['Tables']['exam_paper_questions']['Insert']
export type InsertPracticeTestAssignment = Database['public']['Tables']['practice_test_assignments']['Insert']
export type InsertPracticeTestAttempt = Database['public']['Tables']['practice_test_attempts']['Insert']
export type InsertPracticeTestAnswer = Database['public']['Tables']['practice_test_answers']['Insert']

// ─── UPDATE TYPES ────────────────────────────────────────────────────────────

export type UpdateProfile = Database['public']['Tables']['profiles']['Update']
export type UpdateFileImport = Database['public']['Tables']['file_imports']['Update']
export type UpdateCourse = Database['public']['Tables']['courses']['Update']
export type UpdateClass = Database['public']['Tables']['classes']['Update']
export type UpdateQuestion = Database['public']['Tables']['questions']['Update']
export type UpdateAssignment = Database['public']['Tables']['assignments']['Update']
export type UpdateAssignmentInstance = Database['public']['Tables']['assignment_instances']['Update']
export type UpdateSubmission = Database['public']['Tables']['submissions']['Update']
export type UpdateSubmissionAnswer = Database['public']['Tables']['submission_answers']['Update']
export type UpdateErrorLog = Database['public']['Tables']['error_log']['Update']
export type UpdateExamPaper = Database['public']['Tables']['exam_papers']['Update']
export type UpdateExamPaperQuestion = Database['public']['Tables']['exam_paper_questions']['Update']
export type UpdatePracticeTestAssignment = Database['public']['Tables']['practice_test_assignments']['Update']
export type UpdatePracticeTestAttempt = Database['public']['Tables']['practice_test_attempts']['Update']
export type UpdatePracticeTestAnswer = Database['public']['Tables']['practice_test_answers']['Update']
