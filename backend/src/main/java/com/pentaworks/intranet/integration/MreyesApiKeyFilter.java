package com.pentaworks.intranet.integration;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class MreyesApiKeyFilter extends OncePerRequestFilter {
    public static final String HEADER_NAME = "X-MREyes-Api-Key";
    private static final String PATH_PREFIX = "/api/v1/integrations/mreyes/";
    private final byte[] expectedKey;

    public MreyesApiKeyFilter(String apiKey) {
        this.expectedKey = apiKey == null ? new byte[0] : apiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith(PATH_PREFIX);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        if (expectedKey.length == 0) {
            writeError(response, 503, "MREyes 연동이 설정되지 않았습니다.");
            return;
        }
        String supplied = request.getHeader(HEADER_NAME);
        byte[] suppliedKey = supplied == null ? new byte[0] : supplied.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expectedKey, suppliedKey)) {
            writeError(response, 401, "유효한 MREyes 연동 인증정보가 필요합니다.");
            return;
        }
        var authentication = new UsernamePasswordAuthenticationToken(
            "mreyes-integration", null, List.of(new SimpleGrantedAuthority("ROLE_MREYES_INTEGRATION")));
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        try {
            chain.doFilter(request, response);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
