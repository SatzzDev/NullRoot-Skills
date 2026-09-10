import hashlib
import secrets
import time
import string
import json
from typing import Dict, Optional, Any
from urllib.parse import quote

def generate_random_number(digits: int = 9) -> str:
    """Generate random number with specified digit count"""
    return str(secrets.randbelow(10 ** digits)).zfill(digits)

def generate_base64_random(byte_length: int = 16) -> str:
    """Generate URL-safe base64 random string"""
    import base64
    return base64.urlsafe_b64encode(
        secrets.token_bytes(byte_length)
    ).rstrip(b'=').decode('utf-8')

def generate_uuid_like() -> str:
    """Generate UUID v4-like string"""
    hex_str = secrets.token_hex(16)
    return '-'.join([
        hex_str[:8],
        hex_str[8:12],
        hex_str[12:16],
        hex_str[16:20],
        hex_str[20:32]
    ])

def generate_random_key(length: int = 32) -> str:
    """Generate random alphanumeric key"""
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_md5_hash(data: str) -> str:
    """Generate MD5 hash"""
    return hashlib.md5(data.encode()).hexdigest()

def generate_ga_cookies(measurement_id: Optional[str] = None) -> Dict[str, str]:
    """Generate Google Analytics cookies"""
    now = int(time.time())
    random_num = generate_random_number(9)
    
    # GA Client ID
    ga = f"GA1.1.{random_num}.{now}"
    
    # GA4 Session ID (optional)
    result = {"_ga": ga}
    
    if measurement_id:
        session_id = generate_random_number(9)
        result[f"_ga_{measurement_id}"] = (
            f"GS2.1.s{now}$o1$g0$t{now}$j56$l0$h{session_id}"
        )
    
    return result

def generate_clarity_cookies() -> Dict[str, str]:
    """Generate Microsoft Clarity cookies"""
    now = int(time.time())
    now_ms = int(time.time() * 1000)
    
    clarity_id = generate_base64_random(12)
    
    _clck = f"{clarity_id}%5E2%5Eg9c%5E0%5E2444"
    _clsk = f"v1{generate_base64_random(6)}%5E{now_ms}%5E1%5E1%5Er.clarity.ms%2Fcollect"
    
    return {"_clck": _clck, "_clsk": _clsk}

def generate_g_state_cookie() -> Dict[str, str]:
    """Generate Google Identity state cookie"""
    now_ms = int(time.time() * 1000)
    token = generate_base64_random(32)
    
    g_state = {
        "i_l": 0,
        "i_ll": now_ms,
        "i_b": token,
        "i_e": {"enable_itp_optimization": 24},
        "i_et": now_ms
    }
    
    return {"g_state": quote(json.dumps(g_state, separators=(',', ':')))}

def generate_cookies(
    include_ga: bool = True,
    include_ga4: bool = False,
    measurement_id: Optional[str] = "JQSCTHPS4E",
    include_clarity: bool = True,
    include_google_identity: bool = False
) -> Dict[str, str]:
    """Generate all cookies for browser simulation"""
    cookies = {}
    
    if include_ga or include_ga4:
        ga_cookies = generate_ga_cookies(measurement_id if include_ga4 else None)
        cookies.update(ga_cookies)
    
    if include_clarity:
        cookies.update(generate_clarity_cookies())
    
    if include_google_identity:
        cookies.update(generate_g_state_cookie())
    
    return cookies

def cookies_to_string(cookies: Dict[str, str]) -> str:
    """Convert cookies dict to cookie string"""
    return '; '.join(f'{k}={v}' for k, v in cookies.items())

def generate_headers(
    referer: str = "https://example.com/",
    platform: str = "Windows",
    chrome_version: str = "152",
    user_agent: Optional[str] = None,
    include_cookies: bool = True,
    cookie_options: Optional[Dict[str, Any]] = None
) -> Dict[str, str]:
    """Generate realistic browser headers"""
    
    if user_agent is None:
        user_agent = (
            f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            f"AppleWebKit/537.36 (KHTML, like Gecko) "
            f"Chrome/{chrome_version}.0.0.0 Safari/537.36"
        )
    
    if cookie_options is None:
        cookie_options = {}
    
    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
    }
    
    if include_cookies:
        cookie_opts = {
            "include_ga": True,
            "include_ga4": True,
            "measurement_id": cookie_options.get("measurement_id", "JQSCTHPS4E"),
            "include_clarity": True,
            "include_google_identity": cookie_options.get("include_google_identity", False)
        }
        headers["cookie"] = cookies_to_string(generate_cookies(**cookie_opts))
    
    headers.update({
        "origin": referer.rstrip('/'),
        "referer": referer,
        "user-agent": user_agent,
        # Client Hints
        "sec-ch-ua": f'"Chromium";v="{chrome_version}", "Not?A_Brand";v="24", "Google Chrome";v="{chrome_version}"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": f'"{platform}"',
        # Fetch Metadata
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        # Navigation Hints
        "priority": "u=1, i"
    })
    
    return headers

# Example usage:
if __name__ == "__main__":
    # Generate headers for MusicFab API
    headers = generate_headers(
        referer="https://musicfab.io/",
        platform="Windows",
        chrome_version="152"
    )
    
    for k, v in headers.items():
        print(f"{k}: {v}")