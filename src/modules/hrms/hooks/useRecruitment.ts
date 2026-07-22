// HRMS — Recruitment (M5) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchRequisitions,
  createRequisition,
  updateRequisition,
  submitRequisition,
  decideRequisition,
  setRequisitionStatus,
  fetchPostings,
  createPosting,
  setPostingStatus,
  fetchCandidates,
  fetchCandidate,
  createCandidate,
  updateCandidate,
  setCandidateStatus,
  fetchApplications,
  createApplication,
  setApplicationStage,
  setApplicationStatus,
  fetchInterviews,
  createInterview,
  setInterviewStatus,
  fetchFeedback,
  submitFeedback,
  fetchOffers,
  createOffer,
  sendOffer,
  setOfferStatus,
  acceptOffer,
  type RequisitionInput,
  type RequisitionStatus,
  type PostingInput,
  type PostingStatus,
  type CandidateInput,
  type CandidateStatus,
  type ApplicationInput,
  type ApplicationStatus,
  type InterviewInput,
  type InterviewStatus,
  type FeedbackInput,
  type OfferInput,
  type OfferStatus,
  type AcceptOfferInput,
} from '../api/recruitment'

const RC = ['hrms', 'recruitment'] as const

// ── Requisitions ─────────────────────────────────────────────────────────────
export function useRequisitions(status?: RequisitionStatus) {
  return useQuery({
    queryKey: [...RC, 'requisitions', status ?? 'all'],
    queryFn: () => fetchRequisitions(status),
  })
}

export function useCreateRequisition(raisedBy?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RequisitionInput) => createRequisition(input, raisedBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'requisitions'] })
      toast.success('Requisition created')
    },
    onError: (e: Error) => toast.error('Failed to create requisition', e.message),
  })
}

export function useUpdateRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: RequisitionInput }) => updateRequisition(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'requisitions'] })
      toast.success('Requisition updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSubmitRequisition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => submitRequisition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'requisitions'] })
      toast.success('Submitted for approval')
    },
    onError: (e: Error) => toast.error('Submit failed', e.message),
  })
}

export function useDecideRequisition(approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; approve: boolean }) =>
      decideRequisition(args.id, args.approve, approverId ?? ''),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'requisitions'] })
      toast.success(v.approve ? 'Requisition approved' : 'Requisition rejected')
    },
    onError: (e: Error) => toast.error('Decision failed', e.message),
  })
}

export function useSetRequisitionStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: RequisitionStatus }) => setRequisitionStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'requisitions'] })
      toast.success('Status updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Postings ─────────────────────────────────────────────────────────────────
export function usePostings(status?: PostingStatus) {
  return useQuery({
    queryKey: [...RC, 'postings', status ?? 'all'],
    queryFn: () => fetchPostings(status),
  })
}

export function useCreatePosting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PostingInput) => createPosting(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'postings'] })
      toast.success('Posting created')
    },
    onError: (e: Error) => toast.error('Failed to create posting', e.message),
  })
}

export function useSetPostingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: PostingStatus }) => setPostingStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'postings'] })
      toast.success('Posting updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Candidates ───────────────────────────────────────────────────────────────
export function useCandidates(status?: CandidateStatus) {
  return useQuery({
    queryKey: [...RC, 'candidates', status ?? 'all'],
    queryFn: () => fetchCandidates(status),
  })
}

export function useCandidate(id: string) {
  return useQuery({
    queryKey: [...RC, 'candidate', id],
    enabled: !!id,
    queryFn: () => fetchCandidate(id),
  })
}

export function useCreateCandidate(createdBy?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CandidateInput) => createCandidate(input, createdBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'candidates'] })
      toast.success('Candidate added')
    },
    onError: (e: Error) => toast.error('Failed to add candidate', e.message),
  })
}

export function useUpdateCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: CandidateInput }) => updateCandidate(args.id, args.input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'candidates'] })
      qc.invalidateQueries({ queryKey: [...RC, 'candidate', v.id] })
      toast.success('Candidate updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetCandidateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: CandidateStatus }) => setCandidateStatus(args.id, args.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'candidates'] })
      qc.invalidateQueries({ queryKey: [...RC, 'candidate', v.id] })
      toast.success('Stage updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Applications ─────────────────────────────────────────────────────────────
export function useApplications(candidateId: string) {
  return useQuery({
    queryKey: [...RC, 'applications', candidateId],
    enabled: !!candidateId,
    queryFn: () => fetchApplications(candidateId),
  })
}

export function useCreateApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ApplicationInput) => createApplication(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'applications', v.candidate_id] })
      toast.success('Application added')
    },
    onError: (e: Error) => toast.error('Failed to add application', e.message),
  })
}

export function useSetApplicationStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; stage: string; candidateId: string }) => setApplicationStage(args.id, args.stage),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'applications', v.candidateId] })
      toast.success('Stage updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetApplicationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: ApplicationStatus; candidateId: string }) =>
      setApplicationStatus(args.id, args.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'applications', v.candidateId] })
      toast.success('Application updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Interviews ───────────────────────────────────────────────────────────────
export function useInterviews(applicationId: string) {
  return useQuery({
    queryKey: [...RC, 'interviews', applicationId],
    enabled: !!applicationId,
    queryFn: () => fetchInterviews(applicationId),
  })
}

export function useCreateInterview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InterviewInput) => createInterview(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'interviews', v.application_id] })
      toast.success('Interview scheduled')
    },
    onError: (e: Error) => toast.error('Failed to schedule', e.message),
  })
}

export function useSetInterviewStatus(applicationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: InterviewStatus }) => setInterviewStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'interviews', applicationId] })
      toast.success('Interview updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Feedback ─────────────────────────────────────────────────────────────────
export function useFeedback(interviewId: string) {
  return useQuery({
    queryKey: [...RC, 'feedback', interviewId],
    enabled: !!interviewId,
    queryFn: () => fetchFeedback(interviewId),
  })
}

export function useSubmitFeedback(applicationId: string, interviewerId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: FeedbackInput) => submitFeedback(input, interviewerId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'feedback', v.interview_id] })
      qc.invalidateQueries({ queryKey: [...RC, 'interviews', applicationId] })
      toast.success('Feedback submitted')
    },
    onError: (e: Error) => toast.error('Failed to submit feedback', e.message),
  })
}

// ── Offers ───────────────────────────────────────────────────────────────────
export function useOffers(applicationId: string) {
  return useQuery({
    queryKey: [...RC, 'offers', applicationId],
    enabled: !!applicationId,
    queryFn: () => fetchOffers(applicationId),
  })
}

export function useCreateOffer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OfferInput) => createOffer(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...RC, 'offers', v.application_id] })
      toast.success('Offer drafted')
    },
    onError: (e: Error) => toast.error('Failed to draft offer', e.message),
  })
}

export function useSendOffer(applicationId: string, approverId?: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => sendOffer(id, approverId ?? ''),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'offers', applicationId] })
      toast.success('Offer sent')
    },
    onError: (e: Error) => toast.error('Failed to send offer', e.message),
  })
}

export function useSetOfferStatus(applicationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: OfferStatus }) => setOfferStatus(args.id, args.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'offers', applicationId] })
      toast.success('Offer updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useAcceptOffer(applicationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AcceptOfferInput) => acceptOffer(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RC, 'offers', applicationId] })
      qc.invalidateQueries({ queryKey: [...RC, 'candidates'] })
      qc.invalidateQueries({ queryKey: [...RC, 'applications'] })
      qc.invalidateQueries({ queryKey: ['hrms', 'employees'] })
      qc.invalidateQueries({ queryKey: ['hrms', 'onboarding'] })
      toast.success('Offer accepted — employee provisioned & onboarding started')
    },
    onError: (e: Error) => toast.error('Failed to accept offer', e.message),
  })
}
