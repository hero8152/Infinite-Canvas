from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class DeviceType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PHONE: _ClassVar[DeviceType]
    TABLET: _ClassVar[DeviceType]
    LAPTOP: _ClassVar[DeviceType]

class ChunkState(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    LAST_CHUNK: _ClassVar[ChunkState]
    MORE_CHUNKS: _ClassVar[ChunkState]
PHONE: DeviceType
TABLET: DeviceType
LAPTOP: DeviceType
LAST_CHUNK: ChunkState
MORE_CHUNKS: ChunkState

class EchoRequest(_message.Message):
    __slots__ = ("name", "sharedSecret")
    NAME_FIELD_NUMBER: _ClassVar[int]
    SHAREDSECRET_FIELD_NUMBER: _ClassVar[int]
    name: str
    sharedSecret: str
    def __init__(self, name: _Optional[str] = ..., sharedSecret: _Optional[str] = ...) -> None: ...

class ComputeUnitThreshold(_message.Message):
    __slots__ = ("community", "plus", "expireAt")
    COMMUNITY_FIELD_NUMBER: _ClassVar[int]
    PLUS_FIELD_NUMBER: _ClassVar[int]
    EXPIREAT_FIELD_NUMBER: _ClassVar[int]
    community: float
    plus: float
    expireAt: int
    def __init__(self, community: _Optional[float] = ..., plus: _Optional[float] = ..., expireAt: _Optional[int] = ...) -> None: ...

class EchoReply(_message.Message):
    __slots__ = ("message", "files", "override", "sharedSecretMissing", "thresholds", "serverIdentifier")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    FILES_FIELD_NUMBER: _ClassVar[int]
    OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    SHAREDSECRETMISSING_FIELD_NUMBER: _ClassVar[int]
    THRESHOLDS_FIELD_NUMBER: _ClassVar[int]
    SERVERIDENTIFIER_FIELD_NUMBER: _ClassVar[int]
    message: str
    files: _containers.RepeatedScalarFieldContainer[str]
    override: MetadataOverride
    sharedSecretMissing: bool
    thresholds: ComputeUnitThreshold
    serverIdentifier: int
    def __init__(self, message: _Optional[str] = ..., files: _Optional[_Iterable[str]] = ..., override: _Optional[_Union[MetadataOverride, _Mapping]] = ..., sharedSecretMissing: bool = ..., thresholds: _Optional[_Union[ComputeUnitThreshold, _Mapping]] = ..., serverIdentifier: _Optional[int] = ...) -> None: ...

class FileListRequest(_message.Message):
    __slots__ = ("files", "filesWithHash", "sharedSecret")
    FILES_FIELD_NUMBER: _ClassVar[int]
    FILESWITHHASH_FIELD_NUMBER: _ClassVar[int]
    SHAREDSECRET_FIELD_NUMBER: _ClassVar[int]
    files: _containers.RepeatedScalarFieldContainer[str]
    filesWithHash: _containers.RepeatedScalarFieldContainer[str]
    sharedSecret: str
    def __init__(self, files: _Optional[_Iterable[str]] = ..., filesWithHash: _Optional[_Iterable[str]] = ..., sharedSecret: _Optional[str] = ...) -> None: ...

class FileExistenceResponse(_message.Message):
    __slots__ = ("files", "existences", "hashes")
    FILES_FIELD_NUMBER: _ClassVar[int]
    EXISTENCES_FIELD_NUMBER: _ClassVar[int]
    HASHES_FIELD_NUMBER: _ClassVar[int]
    files: _containers.RepeatedScalarFieldContainer[str]
    existences: _containers.RepeatedScalarFieldContainer[bool]
    hashes: _containers.RepeatedScalarFieldContainer[bytes]
    def __init__(self, files: _Optional[_Iterable[str]] = ..., existences: _Optional[_Iterable[bool]] = ..., hashes: _Optional[_Iterable[bytes]] = ...) -> None: ...

class MetadataOverride(_message.Message):
    __slots__ = ("models", "loras", "controlNets", "textualInversions", "upscalers")
    MODELS_FIELD_NUMBER: _ClassVar[int]
    LORAS_FIELD_NUMBER: _ClassVar[int]
    CONTROLNETS_FIELD_NUMBER: _ClassVar[int]
    TEXTUALINVERSIONS_FIELD_NUMBER: _ClassVar[int]
    UPSCALERS_FIELD_NUMBER: _ClassVar[int]
    models: bytes
    loras: bytes
    controlNets: bytes
    textualInversions: bytes
    upscalers: bytes
    def __init__(self, models: _Optional[bytes] = ..., loras: _Optional[bytes] = ..., controlNets: _Optional[bytes] = ..., textualInversions: _Optional[bytes] = ..., upscalers: _Optional[bytes] = ...) -> None: ...

class ImageGenerationRequest(_message.Message):
    __slots__ = ("image", "scaleFactor", "mask", "hints", "prompt", "negativePrompt", "configuration", "override", "keywords", "user", "device", "contents", "sharedSecret", "chunked")
    IMAGE_FIELD_NUMBER: _ClassVar[int]
    SCALEFACTOR_FIELD_NUMBER: _ClassVar[int]
    MASK_FIELD_NUMBER: _ClassVar[int]
    HINTS_FIELD_NUMBER: _ClassVar[int]
    PROMPT_FIELD_NUMBER: _ClassVar[int]
    NEGATIVEPROMPT_FIELD_NUMBER: _ClassVar[int]
    CONFIGURATION_FIELD_NUMBER: _ClassVar[int]
    OVERRIDE_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    USER_FIELD_NUMBER: _ClassVar[int]
    DEVICE_FIELD_NUMBER: _ClassVar[int]
    CONTENTS_FIELD_NUMBER: _ClassVar[int]
    SHAREDSECRET_FIELD_NUMBER: _ClassVar[int]
    CHUNKED_FIELD_NUMBER: _ClassVar[int]
    image: bytes
    scaleFactor: int
    mask: bytes
    hints: _containers.RepeatedCompositeFieldContainer[HintProto]
    prompt: str
    negativePrompt: str
    configuration: bytes
    override: MetadataOverride
    keywords: _containers.RepeatedScalarFieldContainer[str]
    user: str
    device: DeviceType
    contents: _containers.RepeatedScalarFieldContainer[bytes]
    sharedSecret: str
    chunked: bool
    def __init__(self, image: _Optional[bytes] = ..., scaleFactor: _Optional[int] = ..., mask: _Optional[bytes] = ..., hints: _Optional[_Iterable[_Union[HintProto, _Mapping]]] = ..., prompt: _Optional[str] = ..., negativePrompt: _Optional[str] = ..., configuration: _Optional[bytes] = ..., override: _Optional[_Union[MetadataOverride, _Mapping]] = ..., keywords: _Optional[_Iterable[str]] = ..., user: _Optional[str] = ..., device: _Optional[_Union[DeviceType, str]] = ..., contents: _Optional[_Iterable[bytes]] = ..., sharedSecret: _Optional[str] = ..., chunked: bool = ...) -> None: ...

class HintProto(_message.Message):
    __slots__ = ("hintType", "tensors")
    HINTTYPE_FIELD_NUMBER: _ClassVar[int]
    TENSORS_FIELD_NUMBER: _ClassVar[int]
    hintType: str
    tensors: _containers.RepeatedCompositeFieldContainer[TensorAndWeight]
    def __init__(self, hintType: _Optional[str] = ..., tensors: _Optional[_Iterable[_Union[TensorAndWeight, _Mapping]]] = ...) -> None: ...

class TensorAndWeight(_message.Message):
    __slots__ = ("tensor", "weight")
    TENSOR_FIELD_NUMBER: _ClassVar[int]
    WEIGHT_FIELD_NUMBER: _ClassVar[int]
    tensor: bytes
    weight: float
    def __init__(self, tensor: _Optional[bytes] = ..., weight: _Optional[float] = ...) -> None: ...

class ImageGenerationSignpostProto(_message.Message):
    __slots__ = ("textEncoded", "imageEncoded", "sampling", "imageDecoded", "secondPassImageEncoded", "secondPassSampling", "secondPassImageDecoded", "faceRestored", "imageUpscaled")
    class TextEncoded(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class ImageEncoded(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class Sampling(_message.Message):
        __slots__ = ("step",)
        STEP_FIELD_NUMBER: _ClassVar[int]
        step: int
        def __init__(self, step: _Optional[int] = ...) -> None: ...
    class ImageDecoded(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class SecondPassImageEncoded(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class SecondPassSampling(_message.Message):
        __slots__ = ("step",)
        STEP_FIELD_NUMBER: _ClassVar[int]
        step: int
        def __init__(self, step: _Optional[int] = ...) -> None: ...
    class SecondPassImageDecoded(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class FaceRestored(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    class ImageUpscaled(_message.Message):
        __slots__ = ()
        def __init__(self) -> None: ...
    TEXTENCODED_FIELD_NUMBER: _ClassVar[int]
    IMAGEENCODED_FIELD_NUMBER: _ClassVar[int]
    SAMPLING_FIELD_NUMBER: _ClassVar[int]
    IMAGEDECODED_FIELD_NUMBER: _ClassVar[int]
    SECONDPASSIMAGEENCODED_FIELD_NUMBER: _ClassVar[int]
    SECONDPASSSAMPLING_FIELD_NUMBER: _ClassVar[int]
    SECONDPASSIMAGEDECODED_FIELD_NUMBER: _ClassVar[int]
    FACERESTORED_FIELD_NUMBER: _ClassVar[int]
    IMAGEUPSCALED_FIELD_NUMBER: _ClassVar[int]
    textEncoded: ImageGenerationSignpostProto.TextEncoded
    imageEncoded: ImageGenerationSignpostProto.ImageEncoded
    sampling: ImageGenerationSignpostProto.Sampling
    imageDecoded: ImageGenerationSignpostProto.ImageDecoded
    secondPassImageEncoded: ImageGenerationSignpostProto.SecondPassImageEncoded
    secondPassSampling: ImageGenerationSignpostProto.SecondPassSampling
    secondPassImageDecoded: ImageGenerationSignpostProto.SecondPassImageDecoded
    faceRestored: ImageGenerationSignpostProto.FaceRestored
    imageUpscaled: ImageGenerationSignpostProto.ImageUpscaled
    def __init__(self, textEncoded: _Optional[_Union[ImageGenerationSignpostProto.TextEncoded, _Mapping]] = ..., imageEncoded: _Optional[_Union[ImageGenerationSignpostProto.ImageEncoded, _Mapping]] = ..., sampling: _Optional[_Union[ImageGenerationSignpostProto.Sampling, _Mapping]] = ..., imageDecoded: _Optional[_Union[ImageGenerationSignpostProto.ImageDecoded, _Mapping]] = ..., secondPassImageEncoded: _Optional[_Union[ImageGenerationSignpostProto.SecondPassImageEncoded, _Mapping]] = ..., secondPassSampling: _Optional[_Union[ImageGenerationSignpostProto.SecondPassSampling, _Mapping]] = ..., secondPassImageDecoded: _Optional[_Union[ImageGenerationSignpostProto.SecondPassImageDecoded, _Mapping]] = ..., faceRestored: _Optional[_Union[ImageGenerationSignpostProto.FaceRestored, _Mapping]] = ..., imageUpscaled: _Optional[_Union[ImageGenerationSignpostProto.ImageUpscaled, _Mapping]] = ...) -> None: ...

class RemoteDownloadResponse(_message.Message):
    __slots__ = ("bytesReceived", "bytesExpected", "item", "itemsExpected", "tag")
    BYTESRECEIVED_FIELD_NUMBER: _ClassVar[int]
    BYTESEXPECTED_FIELD_NUMBER: _ClassVar[int]
    ITEM_FIELD_NUMBER: _ClassVar[int]
    ITEMSEXPECTED_FIELD_NUMBER: _ClassVar[int]
    TAG_FIELD_NUMBER: _ClassVar[int]
    bytesReceived: int
    bytesExpected: int
    item: int
    itemsExpected: int
    tag: str
    def __init__(self, bytesReceived: _Optional[int] = ..., bytesExpected: _Optional[int] = ..., item: _Optional[int] = ..., itemsExpected: _Optional[int] = ..., tag: _Optional[str] = ...) -> None: ...

class ImageGenerationResponse(_message.Message):
    __slots__ = ("generatedImages", "currentSignpost", "signposts", "previewImage", "scaleFactor", "tags", "downloadSize", "chunkState", "remoteDownload", "generatedAudio")
    GENERATEDIMAGES_FIELD_NUMBER: _ClassVar[int]
    CURRENTSIGNPOST_FIELD_NUMBER: _ClassVar[int]
    SIGNPOSTS_FIELD_NUMBER: _ClassVar[int]
    PREVIEWIMAGE_FIELD_NUMBER: _ClassVar[int]
    SCALEFACTOR_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    DOWNLOADSIZE_FIELD_NUMBER: _ClassVar[int]
    CHUNKSTATE_FIELD_NUMBER: _ClassVar[int]
    REMOTEDOWNLOAD_FIELD_NUMBER: _ClassVar[int]
    GENERATEDAUDIO_FIELD_NUMBER: _ClassVar[int]
    generatedImages: _containers.RepeatedScalarFieldContainer[bytes]
    currentSignpost: ImageGenerationSignpostProto
    signposts: _containers.RepeatedCompositeFieldContainer[ImageGenerationSignpostProto]
    previewImage: bytes
    scaleFactor: int
    tags: _containers.RepeatedScalarFieldContainer[str]
    downloadSize: int
    chunkState: ChunkState
    remoteDownload: RemoteDownloadResponse
    generatedAudio: _containers.RepeatedScalarFieldContainer[bytes]
    def __init__(self, generatedImages: _Optional[_Iterable[bytes]] = ..., currentSignpost: _Optional[_Union[ImageGenerationSignpostProto, _Mapping]] = ..., signposts: _Optional[_Iterable[_Union[ImageGenerationSignpostProto, _Mapping]]] = ..., previewImage: _Optional[bytes] = ..., scaleFactor: _Optional[int] = ..., tags: _Optional[_Iterable[str]] = ..., downloadSize: _Optional[int] = ..., chunkState: _Optional[_Union[ChunkState, str]] = ..., remoteDownload: _Optional[_Union[RemoteDownloadResponse, _Mapping]] = ..., generatedAudio: _Optional[_Iterable[bytes]] = ...) -> None: ...

class FileChunk(_message.Message):
    __slots__ = ("content", "filename", "offset")
    CONTENT_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    OFFSET_FIELD_NUMBER: _ClassVar[int]
    content: bytes
    filename: str
    offset: int
    def __init__(self, content: _Optional[bytes] = ..., filename: _Optional[str] = ..., offset: _Optional[int] = ...) -> None: ...

class InitUploadRequest(_message.Message):
    __slots__ = ("filename", "sha256", "totalSize")
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    SHA256_FIELD_NUMBER: _ClassVar[int]
    TOTALSIZE_FIELD_NUMBER: _ClassVar[int]
    filename: str
    sha256: bytes
    totalSize: int
    def __init__(self, filename: _Optional[str] = ..., sha256: _Optional[bytes] = ..., totalSize: _Optional[int] = ...) -> None: ...

class UploadResponse(_message.Message):
    __slots__ = ("chunkUploadSuccess", "receivedOffset", "message", "filename")
    CHUNKUPLOADSUCCESS_FIELD_NUMBER: _ClassVar[int]
    RECEIVEDOFFSET_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    chunkUploadSuccess: bool
    receivedOffset: int
    message: str
    filename: str
    def __init__(self, chunkUploadSuccess: bool = ..., receivedOffset: _Optional[int] = ..., message: _Optional[str] = ..., filename: _Optional[str] = ...) -> None: ...

class FileUploadRequest(_message.Message):
    __slots__ = ("initRequest", "chunk", "sharedSecret")
    INITREQUEST_FIELD_NUMBER: _ClassVar[int]
    CHUNK_FIELD_NUMBER: _ClassVar[int]
    SHAREDSECRET_FIELD_NUMBER: _ClassVar[int]
    initRequest: InitUploadRequest
    chunk: FileChunk
    sharedSecret: str
    def __init__(self, initRequest: _Optional[_Union[InitUploadRequest, _Mapping]] = ..., chunk: _Optional[_Union[FileChunk, _Mapping]] = ..., sharedSecret: _Optional[str] = ...) -> None: ...

class PubkeyRequest(_message.Message):
    __slots__ = ("name",)
    NAME_FIELD_NUMBER: _ClassVar[int]
    name: str
    def __init__(self, name: _Optional[str] = ...) -> None: ...

class PubkeyResponse(_message.Message):
    __slots__ = ("message", "pubkey")
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    PUBKEY_FIELD_NUMBER: _ClassVar[int]
    message: str
    pubkey: str
    def __init__(self, message: _Optional[str] = ..., pubkey: _Optional[str] = ...) -> None: ...

class HoursRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HoursResponse(_message.Message):
    __slots__ = ("thresholds",)
    THRESHOLDS_FIELD_NUMBER: _ClassVar[int]
    thresholds: ComputeUnitThreshold
    def __init__(self, thresholds: _Optional[_Union[ComputeUnitThreshold, _Mapping]] = ...) -> None: ...
