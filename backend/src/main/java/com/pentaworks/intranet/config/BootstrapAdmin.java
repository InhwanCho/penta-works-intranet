package com.pentaworks.intranet.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class BootstrapAdmin implements CommandLineRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final String loginId;
    private final String password;
    private final String name;

    public BootstrapAdmin(JdbcTemplate jdbc, PasswordEncoder encoder,
        @Value("${app.bootstrap-admin.login-id:}") String loginId,
        @Value("${app.bootstrap-admin.password:}") String password,
        @Value("${app.bootstrap-admin.name:관리자}") String name) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.loginId = loginId;
        this.password = password;
        this.name = name;
    }

    @Override
    public void run(String... args) {
        if (loginId.isBlank() || password.isBlank()) return;
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE login_id = ?", Integer.class, loginId);
        if (count != null && count == 0) {
            jdbc.update("INSERT INTO users(login_id,password_hash,name,role) VALUES(?,?,?,'ADMIN')",
                loginId, encoder.encode(password), name);
        }
    }
}
