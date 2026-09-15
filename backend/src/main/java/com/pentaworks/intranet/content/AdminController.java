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
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                "INSERT INTO users(login_id,password_hash,name,email,phone,position,role) VALUES(?,?,?,?,?,?,?)",
                Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, body.loginId());
            statement.setString(2, encoder.encode(body.password()));
            statement.setString(3, body.name());
            statement.setString(4, body.email());
            statement.setString(5, body.phone());
            statement.setString(6, body.position());
            statement.setString(7, body.role());
            return statement;
        }, keys);
        return Map.of("id", keys.getKey().longValue());
    }

    @GetMapping("/emergency-contacts")
    public List<Map<String, Object>> emergencyContacts() {
        return jdbc.queryForList("""
            SELECT e.*, u.name user_name FROM emergency_contacts e
            JOIN users u ON u.id=e.user_id ORDER BY u.name,e.priority
            """);
    }

    @PostMapping("/emergency-contacts")
    public void createEmergencyContact(@Valid @RequestBody EmergencyContactRequest body) {
        jdbc.update("INSERT INTO emergency_contacts(user_id,name,relationship,phone,priority,note) VALUES(?,?,?,?,?,?)",
            body.userId(), body.name(), body.relationship(), body.phone(), body.priority(), body.note());
    }

    public record UserRequest(@NotBlank String loginId, @NotBlank String password, @NotBlank String name,
        String email, String phone, String position, @NotBlank String role) {}
    public record EmergencyContactRequest(@NotNull Long userId, @NotBlank String name,
        @NotBlank String relationship, @NotBlank String phone, int priority, String note) {}
}
