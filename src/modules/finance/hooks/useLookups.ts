// Finance — shared lookup hooks (clients, services, projects).
import { useQuery } from '@tanstack/react-query'
import { fetchClients, fetchServices, fetchProjects } from '../api/lookups'

export function useClients() {
  return useQuery({ queryKey: ['finance', 'clients'], queryFn: fetchClients, staleTime: 5 * 60_000 })
}

export function useServices() {
  return useQuery({ queryKey: ['finance', 'services'], queryFn: fetchServices, staleTime: 5 * 60_000 })
}

export function useProjects() {
  return useQuery({ queryKey: ['finance', 'projects'], queryFn: fetchProjects, staleTime: 5 * 60_000 })
}
