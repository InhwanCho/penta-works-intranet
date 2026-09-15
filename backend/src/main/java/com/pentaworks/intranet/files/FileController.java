package com.pentaworks.intranet.files;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.sql.PreparedStatement;
import java.sql.Statement;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
public class FileController {
    private static final Set<String> ALLOWED_TYPES = Set.of(
        "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf");

    private final JdbcTemplate jdbc;
    private final Path uploadRoot;

    public FileController(JdbcTemplate jdbc, @Value("${app.upload-dir}") String uploadDir) {
        this.jdbc = jdbc;
        this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @PostMapping
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file, Authentication auth) throws IOException {
        String mime = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
        if (file.isEmpty()) throw new IllegalArgumentException("빈 파일은 업로드할 수 없습니다.");
        if (!ALLOWED_TYPES.contains(mime)) throw new IllegalArgumentException("이미지 또는 PDF 파일만 업로드할 수 있습니다.");
        String original = Path.of(file.getOriginalFilename() == null ? "file" : file.getOriginalFilename()).getFileName().toString();
        String extension = original.contains(".") ? original.substring(original.lastIndexOf('.')).toLowerCase() : "";
        Path directory = uploadRoot.resolve(LocalDate.now().toString().substring(0, 7));
        Files.createDirectories(directory);
        Path destination = directory.resolve(UUID.randomUUID() + extension).normalize();
        if (!destination.startsWith(uploadRoot)) throw new IllegalArgumentException("잘못된 파일 경로입니다.");
        Files.copy(file.getInputStream(), destination, StandardCopyOption.REPLACE_EXISTING);
        Long userId = jdbc.queryForObject("SELECT id FROM users WHERE login_id=?", Long.class, auth.getName());
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                INSERT INTO files(original_name,stored_name,storage_path,mime_type,file_size,uploaded_by,expires_at)
                VALUES(?,?,?,?,?,?,DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 1 DAY))
                """, Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, original);
            statement.setString(2, destination.getFileName().toString());
            statement.setString(3, destination.toString());
            statement.setString(4, mime);
            statement.setLong(5, file.getSize());
            statement.setLong(6, userId);
            return statement;
        }, keys);
        long id = keys.getKey().longValue();
        return Map.of("id", id, "url", "/api/v1/files/" + id + "/content", "name", original);
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<Resource> content(@PathVariable long id, @RequestParam(defaultValue = "false") boolean download,
        Authentication auth) {
        Map<String, Object> row = jdbc.queryForMap("SELECT original_name,storage_path,mime_type FROM files WHERE id=? AND deleted_at IS NULL", id);
        Path path = Path.of(row.get("storage_path").toString()).normalize();
        if (!path.startsWith(uploadRoot) || !Files.isRegularFile(path)) throw new IllegalArgumentException("파일을 찾을 수 없습니다.");
        String disposition = (download ? "attachment" : "inline") + "; filename*=UTF-8''" +
            URLEncoder.encode(row.get("original_name").toString(), StandardCharsets.UTF_8).replace("+", "%20");
        Long userId = jdbc.queryForObject("SELECT id FROM users WHERE login_id=?", Long.class, auth.getName());
        jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id) VALUES(?,'DOWNLOAD','FILE',?)", userId, id);
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(row.get("mime_type").toString()))
            .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
            .body(new FileSystemResource(path));
    }
}
