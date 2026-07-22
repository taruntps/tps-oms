// HRMS — Training & Development (M7) React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/shared/Toast'
import {
  fetchTrainings,
  fetchTraining,
  createTraining,
  updateTraining,
  setTrainingStatus,
  fetchEnrolments,
  fetchMyEnrolments,
  nominate,
  setEnrolmentStatus,
  completeEnrolment,
  removeEnrolment,
  fetchCertifications,
  fetchMyCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
  expiringCertifications,
  type TrainingInput,
  type TrainingStatus,
  type EnrolmentInput,
  type EnrolmentStatus,
  type CertificationInput,
} from '../api/training'

const TR = ['hrms', 'training'] as const

// ── Trainings ────────────────────────────────────────────────────────────────
export function useTrainings(status?: TrainingStatus) {
  return useQuery({
    queryKey: [...TR, 'trainings', status ?? 'all'],
    queryFn: () => fetchTrainings(status),
  })
}

export function useTraining(id: string) {
  return useQuery({
    queryKey: [...TR, 'training', id],
    enabled: !!id,
    queryFn: () => fetchTraining(id),
  })
}

export function useCreateTraining() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TrainingInput) => createTraining(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'trainings'] })
      toast.success('Training created')
    },
    onError: (e: Error) => toast.error('Failed to create training', e.message),
  })
}

export function useUpdateTraining() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<TrainingInput> }) => updateTraining(args.id, args.input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...TR, 'trainings'] })
      qc.invalidateQueries({ queryKey: [...TR, 'training', v.id] })
      toast.success('Training updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useSetTrainingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: TrainingStatus }) => setTrainingStatus(args.id, args.status),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...TR, 'trainings'] })
      qc.invalidateQueries({ queryKey: [...TR, 'training', v.id] })
      toast.success('Training status updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

// ── Enrolments ───────────────────────────────────────────────────────────────
export function useEnrolments(trainingId: string) {
  return useQuery({
    queryKey: [...TR, 'enrolments', trainingId],
    enabled: !!trainingId,
    queryFn: () => fetchEnrolments(trainingId),
  })
}

export function useMyEnrolments(employeeId: string) {
  return useQuery({
    queryKey: [...TR, 'my-enrolments', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyEnrolments(employeeId),
  })
}

export function useNominate(trainingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: EnrolmentInput) => nominate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'enrolments', trainingId] })
      toast.success('Employee nominated')
    },
    onError: (e: Error) => toast.error('Failed to nominate', e.message),
  })
}

export function useSetEnrolmentStatus(trainingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; status: EnrolmentStatus; score?: number | null }) =>
      setEnrolmentStatus(args.id, args.status, args.score),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'enrolments', trainingId] })
      toast.success('Enrolment updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useCompleteEnrolment(trainingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; score: number | null }) => completeEnrolment(args.id, args.score),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'enrolments', trainingId] })
      toast.success('Marked completed')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useRemoveEnrolment(trainingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => removeEnrolment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'enrolments', trainingId] })
      toast.success('Enrolment removed')
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  })
}

// ── Certifications ───────────────────────────────────────────────────────────
export function useCertifications() {
  return useQuery({
    queryKey: [...TR, 'certifications'],
    queryFn: () => fetchCertifications(),
  })
}

export function useMyCertifications(employeeId: string) {
  return useQuery({
    queryKey: [...TR, 'my-certifications', employeeId],
    enabled: !!employeeId,
    queryFn: () => fetchMyCertifications(employeeId),
  })
}

export function useExpiringCertifications(days: number) {
  return useQuery({
    queryKey: [...TR, 'expiring-certifications', days],
    queryFn: () => expiringCertifications(days),
  })
}

export function useCreateCertification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CertificationInput) => createCertification(input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: [...TR, 'certifications'] })
      qc.invalidateQueries({ queryKey: [...TR, 'my-certifications', v.employee_id] })
      qc.invalidateQueries({ queryKey: [...TR, 'expiring-certifications'] })
      toast.success('Certification added')
    },
    onError: (e: Error) => toast.error('Failed to add certification', e.message),
  })
}

export function useUpdateCertification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; input: Partial<CertificationInput> }) =>
      updateCertification(args.id, args.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'certifications'] })
      qc.invalidateQueries({ queryKey: [...TR, 'my-certifications'] })
      qc.invalidateQueries({ queryKey: [...TR, 'expiring-certifications'] })
      toast.success('Certification updated')
    },
    onError: (e: Error) => toast.error('Update failed', e.message),
  })
}

export function useDeleteCertification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCertification(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...TR, 'certifications'] })
      qc.invalidateQueries({ queryKey: [...TR, 'my-certifications'] })
      qc.invalidateQueries({ queryKey: [...TR, 'expiring-certifications'] })
      toast.success('Certification removed')
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  })
}
