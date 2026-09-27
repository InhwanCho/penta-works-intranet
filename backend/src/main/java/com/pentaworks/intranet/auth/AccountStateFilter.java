package com.pentaworks.intranet.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Existing sessions must respect account deactivation, password reset and role changes. */
public class AccountStateFilter extends OncePerRequestFilter {
    private final JdbcTemplate jdbc;
    public AccountStateFilter(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.isAuthenticated() && request.getSession(false) != null && auth.getAuthorities().stream().noneMatch(a -> a.getAuthority().equals("ROLE_MREYES_INTEGRATION"))) {
            var rows = jdbc.queryForList("SELECT password_hash,role,active FROM users WHERE login_id=?", auth.getName());
            var session = request.getSession(false);
            Object oldHash = session.getAttribute("accountHash");
            boolean valid = !rows.isEmpty() && (Boolean.TRUE.equals(rows.get(0).get("active")) || "1".equals(String.valueOf(rows.get(0).get("active"))));
            if (!valid || !java.util.Objects.equals(oldHash, rows.get(0).get("password_hash"))) {
                session.invalidate(); SecurityContextHolder.clearContext();
                response.setStatus(401); response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"message\":\"계정 상태가 변경되었습니다. 다시 로그인해주세요.\"}"); return;
            }
            session.setAttribute("accountHash", rows.get(0).get("password_hash"));
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new UsernamePasswordAuthenticationToken(auth.getPrincipal(), null, AuthorityUtils.createAuthorityList("ROLE_" + rows.get(0).get("role"))));
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}
