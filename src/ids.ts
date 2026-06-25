import { nanoid } from 'nanoid'

export type TaskId    = string & { readonly __brand: 'TaskId' }
export type ProjectId = string & { readonly __brand: 'ProjectId' }
export type SphereId  = string & { readonly __brand: 'SphereId' }
export type EventId   = string & { readonly __brand: 'EventId' }

export const newTaskId    = (): TaskId    => nanoid() as TaskId
export const newProjectId = (): ProjectId => nanoid() as ProjectId
export const newSphereId  = (): SphereId  => nanoid() as SphereId
export const newEventId   = (): EventId   => nanoid() as EventId
