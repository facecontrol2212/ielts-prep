from fastapi import HTTPException, status


class AppError(HTTPException):
    """Base for domain errors so routers stay thin."""

    def __init__(self, detail: str, code: int = status.HTTP_400_BAD_REQUEST) -> None:
        super().__init__(status_code=code, detail=detail)


class NotFound(AppError):
    def __init__(self, what: str = "Resource") -> None:
        super().__init__(f"{what} not found", status.HTTP_404_NOT_FOUND)


class Forbidden(AppError):
    def __init__(self, detail: str = "Not permitted") -> None:
        super().__init__(detail, status.HTTP_403_FORBIDDEN)


class Conflict(AppError):
    def __init__(self, detail: str = "Conflict") -> None:
        super().__init__(detail, status.HTTP_409_CONFLICT)
