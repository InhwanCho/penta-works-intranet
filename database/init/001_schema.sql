SET NAMES utf8mb4;
SET time_zone = '+09:00';

CREATE TABLE users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    login_id VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(50) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(30) NULL,
    position VARCHAR(50) NULL,
    role ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_login_id (login_id),
    UNIQUE KEY uk_users_email (email),
    KEY idx_users_active_name (active, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE emergency_contacts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    relationship VARCHAR(30) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    priority SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    note VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_emergency_contacts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uk_emergency_contacts_user_priority (user_id, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meetings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    meeting_at DATETIME(6) NOT NULL,
    content_markdown LONGTEXT NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    updated_by_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_meetings_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_meetings_updated_by FOREIGN KEY (updated_by_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_meetings_meeting_at (meeting_at),
    KEY idx_meetings_author (author_id),
    KEY idx_meetings_updated_by (updated_by_id),
    FULLTEXT KEY ft_meetings_search (title, content_markdown)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE meeting_participants (
    meeting_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (meeting_id, user_id),
    CONSTRAINT fk_meeting_participants_meeting FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE,
    CONSTRAINT fk_meeting_participants_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_meeting_participants_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE repair_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    equipment_name VARCHAR(200) NOT NULL,
    description_markdown LONGTEXT NOT NULL,
    written_at DATE NOT NULL,
    hospital_name VARCHAR(200) NULL,
    model_name VARCHAR(200) NULL,
    service_type VARCHAR(50) NULL,
    contract_type VARCHAR(50) NULL,
    manufacture_country VARCHAR(100) NULL,
    manufacture_date DATE NULL,
    manufacturer VARCHAR(200) NULL,
    work_date DATE NULL,
    work_start_time TIME NULL,
    work_end_time TIME NULL,
    travel_minutes INT NULL,
    special_notes LONGTEXT NULL,
    parts_details LONGTEXT NULL,
    labor_fee DECIMAL(14,2) NULL,
    parts_fee DECIMAL(14,2) NULL,
    travel_fee DECIMAL(14,2) NULL,
    total_fee DECIMAL(14,2) NULL,
    remarks LONGTEXT NULL,
    customer_confirmation VARCHAR(200) NULL,
    status ENUM('RECEIVED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'RECEIVED',
    requester_id BIGINT UNSIGNED NOT NULL,
    assignee_id BIGINT UNSIGNED NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_repair_requests_requester FOREIGN KEY (requester_id) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT fk_repair_requests_assignee FOREIGN KEY (assignee_id) REFERENCES users (id) ON DELETE SET NULL,
    KEY idx_repair_requests_status_created (status, created_at),
    KEY idx_repair_requests_assignee (assignee_id),
    FULLTEXT KEY ft_repair_requests_search (equipment_name, description_markdown, special_notes, parts_details, remarks)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE repair_comments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    repair_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    content VARCHAR(2000) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_repair_comments_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    CONSTRAINT fk_repair_comments_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_repair_comments_repair_created (repair_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE repair_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    repair_id BIGINT UNSIGNED NOT NULL,
    previous_status ENUM('RECEIVED', 'IN_PROGRESS', 'COMPLETED') NULL,
    new_status ENUM('RECEIVED', 'IN_PROGRESS', 'COMPLETED') NOT NULL,
    changed_by BIGINT UNSIGNED NOT NULL,
    memo VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_repair_status_history_repair FOREIGN KEY (repair_id) REFERENCES repair_requests (id) ON DELETE CASCADE,
    CONSTRAINT fk_repair_status_history_user FOREIGN KEY (changed_by) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_repair_status_history_repair_created (repair_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_manual_categories_name (name),
    KEY idx_manual_categories_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manuals (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    category_id BIGINT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    description_markdown LONGTEXT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_manuals_category FOREIGN KEY (category_id) REFERENCES manual_categories (id) ON DELETE SET NULL,
    CONSTRAINT fk_manuals_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_manuals_category_active (category_id, active),
    FULLTEXT KEY ft_manuals_search (title, description_markdown)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schedules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    type ENUM('PERSONAL', 'VACATION', 'COMPANY') NOT NULL,
    title VARCHAR(200) NOT NULL,
    description_markdown LONGTEXT NULL,
    start_at DATETIME(6) NOT NULL,
    end_at DATETIME(6) NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    visibility ENUM('PUBLIC', 'PRIVATE') NOT NULL DEFAULT 'PUBLIC',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_schedules_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_schedules_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT chk_schedules_time CHECK (end_at >= start_at),
    KEY idx_schedules_period (start_at, end_at),
    KEY idx_schedules_user_period (user_id, start_at, end_at),
    KEY idx_schedules_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content_markdown LONGTEXT NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    published_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_notices_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY idx_notices_pinned_published (pinned, published_at),
    FULLTEXT KEY ft_notices_search (title, content_markdown)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    storage_path VARCHAR(1000) NOT NULL,
    mime_type VARCHAR(150) NOT NULL,
    file_size BIGINT UNSIGNED NOT NULL,
    checksum_sha256 CHAR(64) NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    upload_status ENUM('TEMP', 'ATTACHED') NOT NULL DEFAULT 'TEMP',
    expires_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
    UNIQUE KEY uk_files_storage_path (storage_path),
    KEY idx_files_temp_expiration (upload_status, expires_at),
    KEY idx_files_uploader_created (uploaded_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE file_links (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    file_id BIGINT UNSIGNED NOT NULL,
    target_type ENUM('MEETING', 'REPAIR', 'MANUAL', 'NOTICE') NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    usage_type ENUM('INLINE_IMAGE', 'ATTACHMENT', 'PDF') NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_file_links_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
    UNIQUE KEY uk_file_links_target_file (target_type, target_id, file_id),
    KEY idx_file_links_target (target_type, target_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manual_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    manual_id BIGINT UNSIGNED NOT NULL,
    version_no INT UNSIGNED NOT NULL,
    file_id BIGINT UNSIGNED NOT NULL,
    change_note VARCHAR(1000) NULL,
    uploaded_by BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_manual_versions_manual FOREIGN KEY (manual_id) REFERENCES manuals (id) ON DELETE CASCADE,
    CONSTRAINT fk_manual_versions_file FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE RESTRICT,
    CONSTRAINT fk_manual_versions_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE RESTRICT,
    UNIQUE KEY uk_manual_versions_version (manual_id, version_no),
    UNIQUE KEY uk_manual_versions_file (file_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    recipient_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NULL,
    target_type VARCHAR(30) NULL,
    target_id BIGINT UNSIGNED NULL,
    read_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users (id) ON DELETE CASCADE,
    KEY idx_notifications_recipient_read (recipient_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id BIGINT UNSIGNED NULL,
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'DOWNLOAD', 'LOGIN', 'LOGIN_FAILED') NOT NULL,
    target_type VARCHAR(30) NOT NULL,
    target_id BIGINT UNSIGNED NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(500) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    KEY idx_audit_logs_target (target_type, target_id, created_at),
    KEY idx_audit_logs_user_created (user_id, created_at),
    KEY idx_audit_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
