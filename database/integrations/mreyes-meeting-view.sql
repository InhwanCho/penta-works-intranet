-- Apply as the MREyes database administrator in the production MREyes database.
-- The intranet account receives SELECT on this view ONLY, never base-table privileges.
CREATE OR REPLACE SQL SECURITY DEFINER VIEW office_meeting_read AS
SELECT m.id,m.title,m.meeting_at,m.content_markdown,m.author_name,m.updated_by_name,
       m.participant_names,m.created_at,m.updated_at,m.deleted_at
FROM workspace_meeting m JOIN company c ON c.id=m.company_id
WHERE c.code='PENTAWORKS' AND c.status='ACTIVE' AND m.deleted_at IS NULL;
-- Provision the account/password outside source control, then:
-- GRANT SELECT ON pentaworks_mri_db.office_meeting_read TO 'office_meetings_reader'@'%';
