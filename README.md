# TripSync Master

여행 장소·먹거리·쇼핑을 한 곳에서 관리하는 정적 웹 앱입니다.

## 기능
- 장소/먹거리/쇼핑 항목 검색 및 저장
- 릴스 하나에 여러 장소를 묶어 저장하고 지도에 개별 핀 표시
- 지도(OpenStreetMap/Google Maps) 표시
- Gemini AI 기반 인터넷 검색 (API 키 선택)
- 대표 사진 자동 찾기 (Wikipedia/Wikimedia)
- 메모, 완료 체크, 백업/복원
- 모바일 반응형 + PWA (오프라인 캐시)
- 현재 위치 표시

## 로컬 실행
```bash
python3 -m http.server 8765
# http://localhost:8765# trip-app
