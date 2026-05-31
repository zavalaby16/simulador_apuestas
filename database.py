from sqlmodel import SQLModel, create_engine, Session

sqlite_file_name = "apuestas.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)

# ASEGÚRATE DE QUE ESTA FUNCIÓN SE LLAME EXACTAMENTE ASÍ:
def init_db():
    SQLModel.metadata.create_all(engine)

# Y ESTA TAMBIÉN:
def get_session():
    with Session(engine) as session:
        yield session