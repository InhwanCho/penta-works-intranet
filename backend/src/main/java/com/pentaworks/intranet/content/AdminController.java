package com.pentaworks.intranet.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;

    public AdminController(JdbcTemplate jdbc, PasswordEncoder encoder) {
        this.jdbc = jdbc;
        this.encoder = encoder;
    }

    @GetMapping("/users")
    public List<Map<String, Object>> users() {
        return jdbc.queryForList("SELECT id,login_id,name,email,phone,position,role,active,last_login_at,created_at FROM users ORDER BY active DESC,name");
    }

    @PostMapping("/users")
    @Transactional
    public Map<String, Object> createUser(@Valid @RequestBody UserRequest body, Authentication auth) {
        validateRole(body.role());
        validatePassword(body.password());
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO users(login_id,password_hash,name,email,phone,position,role) VALUES(?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, body.loginId());
            statement.setString(2, encoder.encode(body.password()));
            statement.setString(3, body.name());
            statement.setString(4, blank(body.email()));
            statement.setString(5, body.phone());
            statement.setString(6, body.position());
            statement.setString(7, body.role());
            return statement;
        }, keys);
        return Map.of("id", keys.getKey().longValue());
    }

    @PutMapping("/users/{id}")
    @Transactional
    public void updateUser(@PathVariable long id, @Valid @RequestBody UserUpdate body, Authentication auth) {
        validateRole(body.role());
        // Serialize administrator changes so two concurrent demotions cannot remove all admins.
        jdbc.queryForList("SELECT id FROM users WHERE role='ADMIN' ORDER BY id FOR UPDATE", Long.class);
        var current = jdbc.queryForMap("SELECT login_id,role,active FROM users WHERE id=?", id);
        if (auth.getName().equals(current.get("login_id")) && (!body.active() || !"ADMIN".equals(body.role()))) throw new IllegalArgumentException("현재 로그인한 관리자 계정은 비활성화하거나 권한을 낮출 수 없습니다.");
        if ("ADMIN".equals(current.get("role")) && (!body.active() || !"ADMIN".equals(body.role()))) {
            Integer others = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role='ADMIN' AND active=TRUE AND id<>?", Integer.class, id);
            if (others == null || others == 0) throw new IllegalArgumentException("활성 관리자 계정이 최소 한 개 필요합니다.");
        }
        jdbc.update("UPDATE users SET name=?,email=?,phone=?,position=?,role=?,active=? WHERE id=?", body.name(), blank(body.email()), blank(body.phone()), blank(body.position()), body.role(), body.active(), id);
        if (body.password() != null && !body.password().isBlank()) {
            validatePassword(body.password());
            jdbc.update("UPDATE users SET password_hash=? WHERE id=?", encoder.encode(body.password()), id);
        }
        jdbc.update("INSERT INTO audit_logs(user_id,action,target_type,target_id) SELECT id,'UPDATE','USER',? FROM users WHERE login_id=?", id, auth.getName());
    }

    @PutMapping("/emergency-contacts/{id}")
    public void updateContact(@PathVariable long id, @Valid @RequestBody EmergencyContactRequest body) {
        if (body.priority() < 1) throw new IllegalArgumentException("연락 순서는 1 이상이어야 합니다.");
        if (jdbc.update("UPDATE emergency_contacts SET user_id=?,name=?,relationship=?,phone=?,priority=?,note=? WHERE id=?", body.userId(), body.name(), body.relationship(), body.phone(), body.priority(), body.note(), id) == 0) throw new IllegalArgumentException("연락처를 찾을 수 없습니다.");
    }

    @DeleteMapping("/emergency-contacts/{id}")
    public void deleteContact(@PathVariable long id) { jdbc.update("DELETE FROM emergency_contacts WHERE id=?", id); }

    private static void validateRole(String role) { if (!List.of("ADMIN", "USER", "ACCOUNTING").contains(role)) throw new IllegalArgumentException("권한이 올바르지 않습니다."); }
    private static void validatePassword(String password) { if (password == null || password.length() < 10 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) throw new IllegalArgumentException("비밀번호는 10자 이상, UTF-8 72바이트 이하여야 합니다."); }
    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    public record UserUpdate(@NotBlank String name, String email, String phone, String position, @NotBlank String role, boolean active, String password) {}

    @GetMapping("/emergency-contacts")
    public List<Map<String, Object>> emergencyContacts() {
        return jdbc.queryForList("""
            SELECT e.*, u.name user_name FROM emergency_contacts e
            JOIN users u ON u.id=e.user_id ORDER BY u.name,e.priority
            """);
    }

    @PostMapping("/emergency-contacts")
    public void createEmergencyContact(@Valid @RequestBody EmergencyContactRequest body) {
        if (body.priority() < 1) throw new IllegalArgumentException("연락 순서는 1 이상이어야 합니다.");
        jdbc.update("INSERT INTO emergency_contacts(user_id,name,relationship,phone,priority,note) VALUES(?,?,?,?,?,?)",
            body.userId(), body.name(), body.relationship(), body.phone(), body.priority(), body.note());
    }

    public record UserRequest(@NotBlank String loginId, @NotBlank String password, @NotBlank String name,
        String email, String phone, String position, @NotBlank String role) {}
    public record EmergencyContactRequest(@NotNull Long userId, @NotBlank String name,
        @NotBlank String relationship, @NotBlank String phone, int priority, String note) {}
}
