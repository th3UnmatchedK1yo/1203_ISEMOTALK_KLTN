"""Load an authentic private serving factory after explicit artifact verification.

Config requires labels, factorySource, and artifacts [{path, sha256, role}].
Declare every weight, tokenizer/preprocessing file and serving source dependency.
This gate establishes package identity and a four-class sanity check, not paper
reproduction or accuracy on customer-service recordings. See the recovery guide.
"""
from __future__ import annotations

import hashlib
import importlib
import inspect
import json
import math
import re
import sys
import threading
from pathlib import Path
from typing import Optional

from .base import EMOTIONS, AudioSlicer, ModelNotReady, SerItem, SerOutput, Status, normalize_probs


SCHEMA_VERSION = 2
_SHA256 = re.compile(r"[0-9a-f]{64}")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def verification_path(config_path: Path) -> Path:
    return config_path.with_name("verification.json")


def _json_object(path: Path) -> dict:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} phải chứa JSON object.")
    return value


def artifact_manifest(config_path: Path, *, check_hashes: bool = True) -> tuple[dict, list[dict]]:
    """Resolve declared files; never guess model architecture or download assets."""
    config_path = config_path.resolve()
    cfg = _json_object(config_path)
    labels = cfg.get("labels")
    if not isinstance(labels, list) or sorted(labels) != sorted(EMOTIONS):
        raise ValueError(f"labels phải là hoán vị tường minh của {list(EMOTIONS)}.")
    declared = cfg.get("artifacts")
    if not isinstance(declared, list) or not declared:
        raise ValueError("Cấu hình thiếu artifacts [{path, sha256, role}].")
    source = cfg.get("factorySource")
    if not isinstance(source, str) or not source.strip():
        raise ValueError("Cấu hình thiếu factorySource (tệp Python chứa factory).")
    source_path = (config_path.parent / source).resolve()
    artifacts, seen = [], set()
    for entry in declared:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str) or not entry["path"].strip():
            raise ValueError("Mục artifacts không hợp lệ.")
        path = (config_path.parent / entry["path"]).resolve()
        digest, role = entry.get("sha256"), entry.get("role")
        if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
            raise ValueError(f"Thiếu SHA256 hợp lệ cho {path.name}.")
        if role not in ("weights", "code", "preprocessing", "metadata"):
            raise ValueError("role phải là weights, code, preprocessing hoặc metadata.")
        if path in seen or not path.is_file():
            raise ValueError(f"Tệp artifact bị trùng hoặc không tồn tại: {path}")
        if check_hashes and sha256_file(path) != digest:
            raise ValueError(f"SHA256 artifact đã thay đổi: {path.name}")
        seen.add(path)
        artifacts.append({"path": str(path), "sha256": digest, "role": role})
    if not any(a["role"] == "weights" for a in artifacts):
        raise ValueError("artifacts phải khai báo ít nhất một tệp weights.")
    if not any(a["path"] == str(source_path) and a["role"] == "code" for a in artifacts):
        raise ValueError("factorySource phải nằm trong artifacts với role=code.")
    cfg["_config_dir"] = str(config_path.parent)
    cfg["_factory_source"] = str(source_path)
    return cfg, sorted(artifacts, key=lambda a: a["path"])


def _record_files(record: dict) -> list[dict]:
    manifest = record.get("manifest")
    audio_files = record.get("evaluationAudio")
    if not isinstance(manifest, dict) or not isinstance(audio_files, list) or not audio_files:
        raise ValueError("Bản xác minh thiếu manifest/evaluationAudio.")
    files = [manifest, *audio_files]
    for item in files:
        if (not isinstance(item, dict) or not isinstance(item.get("path"), str)
                or not isinstance(item.get("sha256"), str) or not _SHA256.fullmatch(item["sha256"])):
            raise ValueError("Danh tính tệp đánh giá không hợp lệ.")
        if not Path(item["path"]).is_absolute() or not Path(item["path"]).is_file():
            raise ValueError("Không tìm thấy tệp đánh giá đã xác minh.")
    return files


def read_verification(config_path: Path, factory: Optional[str] = None, *, check_hashes: bool = True) -> tuple[bool, str]:
    """Full hashes by default; health uses structure/stat checks until model load."""
    try:
        v = _json_object(verification_path(config_path))
        if v.get("schemaVersion") != SCHEMA_VERSION:
            raise ValueError("Bản xác minh cũ/không hợp lệ; chạy lại python -m app.verify.")
        if v.get("verified") is not True:
            raise ValueError("Lần đánh giá gần nhất không đạt ngưỡng.")
        if not isinstance(v.get("factory"), str) or ":" not in v["factory"] or (factory is not None and v["factory"] != factory):
            raise ValueError("Factory khác với bản đã xác minh.")
        if v.get("configSha256") != sha256_file(config_path):
            raise ValueError("Cấu hình đã thay đổi sau lần xác minh.")
        _, artifacts = artifact_manifest(config_path, check_hashes=check_hashes)
        if v.get("artifacts") != artifacts:
            raise ValueError("Danh sách artifacts khác bản đã xác minh.")
        score, threshold, count = v.get("macroF1"), v.get("threshold"), v.get("n")
        if (isinstance(score, bool) or not isinstance(score, (float, int)) or not math.isfinite(score)
                or isinstance(threshold, bool) or not isinstance(threshold, (float, int)) or not math.isfinite(threshold)
                or not 0 < threshold <= score <= 1 or type(count) is not int or count < 4):
            raise ValueError("Điểm/ngưỡng/số mẫu xác minh không hợp lệ.")
        per = v.get("perClass")
        if not isinstance(per, dict) or set(per) != set(EMOTIONS):
            raise ValueError("Bản xác minh thiếu bốn lớp cảm xúc.")
        if any(not isinstance(per[e], dict) or type(per[e].get("support")) is not int or per[e]["support"] <= 0 for e in EMOTIONS):
            raise ValueError("Mỗi lớp phải có mẫu đánh giá.")
        if sum(per[e]["support"] for e in EMOTIONS) != count:
            raise ValueError("Số mẫu theo lớp không khớp.")
        for item in _record_files(v):
            if check_hashes and sha256_file(Path(item["path"])) != item["sha256"]:
                raise ValueError("Manifest hoặc âm thanh đánh giá đã thay đổi.")
        return True, f"kiểm tra bốn lớp đạt (macro-F1 {score:.4f}, n={count}); không phải độ chính xác tổng đài"
    except (OSError, ValueError, TypeError, KeyError) as exc:
        return False, str(exc)


def package_fingerprint(config_path: Path, *, include_verification: bool = True) -> tuple:
    """Cheap change detection after a full hash check; no repeated weight hashing in health."""
    _, artifacts = artifact_manifest(config_path, check_hashes=False)
    paths = [config_path.resolve(), *(Path(a["path"]) for a in artifacts)]
    vp = verification_path(config_path)
    if include_verification and vp.is_file():
        paths.append(vp.resolve())
        record = _json_object(vp)
        if record.get("schemaVersion") == SCHEMA_VERSION:
            paths.extend(Path(x["path"]) for x in _record_files(record))
    result = []
    for p in sorted(set(paths)):
        stat = p.stat()
        result.append((str(p), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns, stat.st_ino))
    return tuple(result)


class CheckpointSer:
    name = "checkpoint"
    mock = False

    def __init__(self, factory: str, config_path: str, allow_unverified: bool = False) -> None:
        self.factory = factory
        self.config_path = Path(config_path).expanduser().resolve() if config_path else None
        self.allow_unverified = allow_unverified
        self._model = None
        self._labels: list[str] = list(EMOTIONS)
        self._identity = None
        self.verified = False
        self._lock = threading.Lock()

    def _problem(self) -> Optional[str]:
        if not self.factory or ":" not in self.factory:
            return 'Chưa cấu hình ISEMO_SER_FACTORY (dạng "module:function").'
        if self.config_path is None or not self.config_path.is_file():
            return "Không tìm thấy ISEMO_SER_CONFIG."
        return None

    def _unchanged(self) -> bool:
        return self._identity is None or package_fingerprint(self.config_path, include_verification=not self.allow_unverified) == self._identity

    def status(self) -> Status:
        problem = self._problem()
        if problem:
            return Status(self.name, False, False, problem, verified=False, loaded=False)
        try:
            artifact_manifest(self.config_path, check_hashes=False)
            if not self._unchanged():
                self.verified = False
                raise ValueError("Gói mô hình đã thay đổi; xác minh lại và khởi động lại dịch vụ.")
            ok, why = read_verification(self.config_path, self.factory, check_hashes=False)
            if not ok and not self.allow_unverified:
                raise ValueError(why)
        except (OSError, ValueError, TypeError, KeyError) as exc:
            self.verified = False
            return Status(self.name, False, False, str(exc), verified=False, loaded=self._model is not None)
        detail = f"{self.factory}: " + ("đã nạp; " + why if self._model is not None else "cấu hình sẵn; sẽ kiểm SHA256 và nạp khi dùng lần đầu")
        if self.allow_unverified:
            detail += " · cho phép chế độ gỡ lỗi chưa xác minh"
        # A previously verified immutable package can be selected for a *cold*
        # inference job. On its first run _load performs the FULL SHA256 check
        # and returns genuine probabilities; do not require model residency
        # merely to let the user submit an audio job.
        return Status(self.name, True, False, detail, verified=bool(ok), loaded=self._model is not None)

    def _load(self):
        try:
            if self._model is not None:
                if not self._unchanged():
                    self.verified = False
                    raise ValueError("Gói mô hình đã thay đổi; xác minh lại và khởi động lại dịch vụ.")
                return self._model
            problem = self._problem()
            if problem:
                raise ValueError(problem)
            # Establish the candidate identity before hashing. A replacement
            # after a successful hash check must not become the trusted baseline.
            identity = package_fingerprint(self.config_path, include_verification=not self.allow_unverified)
            cfg, _ = artifact_manifest(self.config_path)
            ok, why = read_verification(self.config_path, self.factory)
            if not ok and not self.allow_unverified:
                raise ValueError(why)
            if package_fingerprint(self.config_path, include_verification=not self.allow_unverified) != identity:
                raise ValueError("Artifacts đã đổi trong lúc xác minh; không nạp mô hình.")
            module_name, _, func_name = self.factory.partition(":")
            if cfg["_config_dir"] not in sys.path:
                sys.path.insert(0, cfg["_config_dir"])
            # Private model packages may live outside this public web project.
            # Only add explicitly declared existing roots from the hashed config.
            roots = cfg.get("importRoots", [])
            if not isinstance(roots, list) or any(not isinstance(r, str) for r in roots):
                raise ValueError("importRoots phải là danh sách đường dẫn module.")
            for relative in roots:
                root = (Path(cfg["_config_dir"]) / relative).resolve()
                if not root.is_dir():
                    raise ValueError(f"Import root không tồn tại: {root}")
                if str(root) not in sys.path:
                    sys.path.insert(0, str(root))
            factory = getattr(importlib.import_module(module_name), func_name)
            actual_source = inspect.getsourcefile(factory)
            if not actual_source or Path(actual_source).resolve() != Path(cfg["_factory_source"]):
                raise ValueError("Factory được import không khớp factorySource đã khai báo.")
            model = factory(cfg)
            if not callable(getattr(model, "predict", None)):
                raise ValueError("Factory phải trả đối tượng có predict(waveform, text, speaker).")
            if package_fingerprint(self.config_path, include_verification=not self.allow_unverified) != identity:
                raise ValueError("Artifacts đã đổi trong lúc nạp mô hình.")
            self._labels = list(cfg["labels"])
            self._identity, self._model, self.verified = identity, model, ok
            return model
        except ModelNotReady:
            raise
        except Exception as exc:
            self.verified = False
            raise ModelNotReady(f"Không nạp được SER qua {self.factory}: {exc}") from exc

    def _canonical(self, probs) -> Optional[list[float]]:
        if probs is None:
            return None
        vec = normalize_probs(probs, "SER probabilities")
        by_label = dict(zip(self._labels, vec))
        return [by_label[e] for e in EMOTIONS]

    def predict(self, items: list[SerItem], audio: AudioSlicer) -> list[SerOutput]:
        with self._lock:
            model = self._load()
            outputs: list[SerOutput] = []
            for it in items:
                try:
                    res = model.predict(audio(it.start, it.end, it.speaker), it.text, it.speaker)
                    fused = self._canonical(res["fused"])
                    if fused is None:
                        raise ValueError("Thiếu fused probabilities.")
                    outputs.append(SerOutput(fused=fused, acoustic=self._canonical(res.get("acoustic")), lexical=self._canonical(res.get("lexical"))))
                except ModelNotReady:
                    raise
                except Exception as exc:
                    raise ModelNotReady(f"Mô hình SER lỗi ở câu {it.id}: {exc}") from exc
            if not self._unchanged():
                self.verified = False
                raise ModelNotReady("Artifacts đã thay đổi trong lúc suy luận; không trả kết quả này.")
            return outputs
