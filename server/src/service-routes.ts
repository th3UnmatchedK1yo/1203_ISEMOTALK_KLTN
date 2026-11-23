import type { Express } from 'express'
import type { DB } from './db'
import { addCaseContact, addCaseTask, createServiceCase, recordAttempt, updateCaseTask, updateServiceCase } from './service-operations'
import { listCases, readCaseDetail } from './service-read'
import { AddAttempt, AddContact, AddTask, CreateCase, EditCase, EditTask, ListQuery } from './service-validation'

export function attachServiceRoutes(app: Express, db: DB) {
  app.get('/api/cases', (req, res) => {
    const query = ListQuery.parse(Object.fromEntries(Object.entries(req.query).filter(([, value]) => value !== '')))
    res.json(db.transaction(() => listCases(db, query)).deferred())
  })
  app.post('/api/cases', (req, res) => res.status(201).json(createServiceCase(db, CreateCase.parse(req.body))))
  app.get('/api/cases/:id', (req, res) => res.json(db.transaction(() => readCaseDetail(db, req.params.id)).deferred()))
  app.put('/api/cases/:id', (req, res) => res.json(updateServiceCase(db, req.params.id, EditCase.parse(req.body))))
  app.post('/api/cases/:id/contacts', (req, res) => res.json(addCaseContact(db, req.params.id, AddContact.parse(req.body))))
  app.post('/api/cases/:id/tasks', (req, res) => res.json(addCaseTask(db, req.params.id, AddTask.parse(req.body))))
  app.put('/api/cases/:id/tasks/:taskId', (req, res) => res.json(updateCaseTask(db, req.params.id, req.params.taskId, EditTask.parse(req.body))))
  app.post('/api/cases/:id/tasks/:taskId/attempts', (req, res) => res.json(recordAttempt(db, req.params.id, req.params.taskId, AddAttempt.parse(req.body))))
  app.get('/api/cases/:id/export.json', (req, res) => {
    const detail = db.transaction(() => readCaseDetail(db, req.params.id, true)).deferred()
    res.attachment(detail.case.id + '.json').json({
      schemaVersion: 1, exportedAt: new Date().toISOString(), ...detail,
      linkedRecordingIds: detail.contacts.flatMap(c => c.recordedCallId ? [c.recordedCallId] : []),
      sources: {
        manual: 'Nhân viên tự ghi nhận liên hệ. Dữ liệu không được đồng bộ từ tổng đài.',
        recording_import: 'Nhân viên liên kết một hồ sơ cuộc gọi hiện có. recordedCallId lưu mã gốc sau khi xóa.',
        serviceDecisions: 'Người sử dụng tự khai tên và ghi nhận kết quả nghiệp vụ.',
      },
    })
  })
}
