package com.pentaworks.intranet.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration
public class PersistentSessionConfig {
    @Bean DefaultCookieSerializer sessionCookie(@Value("${server.servlet.session.cookie.secure:false}") boolean secure){
        var cookie=new DefaultCookieSerializer();cookie.setCookieName("PENTA_SESSION");cookie.setCookiePath("/");cookie.setUseHttpOnlyCookie(true);cookie.setUseSecureCookie(secure);cookie.setSameSite("Lax");return cookie;
    }
}
